
-- ============================================================================
-- COLLEGE-CHALO: SUPABASE DATABASE SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- STRICT ROLE-BASED ACCESS CONTROL (STUDENT, FACULTY, STAFF COMMUNITIES)
-- ============================================================================

-- 1. COMMUNITY ROLE ENUM
DO $$ BEGIN
    CREATE TYPE community_role_type AS ENUM ('student', 'faculty', 'staff');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. USER PROFILES TABLE (EXTENDS auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    university_name TEXT NOT NULL,
    id_card_number TEXT,
    avatar_url TEXT,
    community_role community_role_type NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('pending_review', 'verified', 'rejected')),
    verification_document_url TEXT,
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(community_role);
CREATE INDEX IF NOT EXISTS idx_profiles_verification ON public.profiles(verification_status);

-- 3. RIDES TABLE
CREATE TABLE IF NOT EXISTS public.rides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    community_role community_role_type NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    departure_time TIMESTAMPTZ NOT NULL,
    vehicle_type TEXT NOT NULL DEFAULT 'car' CHECK (vehicle_type IN ('bike', 'car')),
    total_seats INT NOT NULL CHECK (total_seats > 0),
    available_seats INT NOT NULL CHECK (available_seats >= 0),
    price_per_seat NUMERIC(8,2) DEFAULT 0.00 CHECK (price_per_seat >= 0),
    car_model TEXT,
    car_plate TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_bike_seat_limit CHECK (vehicle_type != 'bike' OR total_seats = 1)
);


-- Index for ride searches filtered by community
CREATE INDEX IF NOT EXISTS idx_rides_community_role ON public.rides(community_role, status, departure_time);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON public.rides(driver_id);

-- 4. BOOKINGS TABLE
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seats_booked INT NOT NULL DEFAULT 1 CHECK (seats_booked > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
    booking_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_active_passenger_ride UNIQUE (ride_id, passenger_id)
);

CREATE INDEX IF NOT EXISTS idx_bookings_ride ON public.bookings(ride_id);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger ON public.bookings(passenger_id);

-- 5. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    community_role community_role_type NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'system',
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read);

-- ============================================================================
-- DATABASE INTEGRITY & SECURITY TRIGGERS (INDEPENDENT OF UI)
-- ============================================================================

-- Function: Helper to get authenticated user's verified role
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS community_role_type AS $$
    SELECT community_role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Trigger 1: Prevent users from changing their community_role directly
CREATE OR REPLACE FUNCTION public.prevent_profile_role_tampering()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.community_role IS DISTINCT FROM NEW.community_role THEN
        RAISE EXCEPTION 'Category change requires an authorized verification process. Direct role modification is strictly prohibited.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_tampering ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_tampering
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_role_tampering();

-- Trigger 2: Enforce that ride.community_role EXACTLY matches driver's profile role
CREATE OR REPLACE FUNCTION public.enforce_ride_community_role()
RETURNS TRIGGER AS $$
DECLARE
    driver_role community_role_type;
    driver_verified TEXT;
BEGIN
    SELECT community_role, verification_status INTO driver_role, driver_verified
    FROM public.profiles
    WHERE id = NEW.driver_id;

    IF driver_role IS NULL THEN
        RAISE EXCEPTION 'Driver profile does not exist.';
    END IF;

    IF driver_verified != 'verified' THEN
        RAISE EXCEPTION 'Only verified members can offer rides in College-Chalo.';
    END IF;

    -- Force or validate role match
    IF NEW.community_role IS DISTINCT FROM driver_role THEN
        RAISE EXCEPTION 'Ride community category (%) must match driver verified role (%).', NEW.community_role, driver_role;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.community_role IS DISTINCT FROM NEW.community_role THEN
        RAISE EXCEPTION 'Ride community role cannot be modified after publishing.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_ride_community_role ON public.rides;
CREATE TRIGGER trg_enforce_ride_community_role
    BEFORE INSERT OR UPDATE ON public.rides
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_ride_community_role();

-- Trigger 3: Strict Cross-Community Booking Enforcer
-- When passenger books a ride, validate:
-- - Passenger is authenticated and verified
-- - Driver is verified
-- - Passenger and ride belong to the EXACT same community category
-- - Ride is active and has sufficient available seats
CREATE OR REPLACE FUNCTION public.validate_booking_community_rule()
RETURNS TRIGGER AS $$
DECLARE
    passenger_role community_role_type;
    passenger_verified TEXT;
    ride_role community_role_type;
    ride_status TEXT;
    seats_remaining INT;
    driver_id UUID;
    driver_role community_role_type;
BEGIN
    -- Check passenger
    SELECT community_role, verification_status INTO passenger_role, passenger_verified
    FROM public.profiles
    WHERE id = NEW.passenger_id;

    IF passenger_role IS NULL THEN
        RAISE EXCEPTION 'Passenger profile not found.';
    END IF;

    IF passenger_verified != 'verified' THEN
        RAISE EXCEPTION 'Your account must be verified before booking rides.';
    END IF;

    -- Check ride
    SELECT community_role, status, available_seats, driver_id
    INTO ride_role, ride_status, seats_remaining, driver_id
    FROM public.rides
    WHERE id = NEW.ride_id;

    IF ride_role IS NULL THEN
        RAISE EXCEPTION 'Ride not found.';
    END IF;

    IF ride_status != 'active' THEN
        RAISE EXCEPTION 'This ride is no longer active.';
    END IF;

    -- Driver role check
    SELECT community_role INTO driver_role FROM public.profiles WHERE id = driver_id;

    -- STRICT RULE: Passenger role must match ride community category
    IF passenger_role IS DISTINCT FROM ride_role THEN
        RAISE EXCEPTION 'This ride is available only to members of your own college community.';
    END IF;

    -- Prevent booking own ride
    IF NEW.passenger_id = driver_id THEN
        RAISE EXCEPTION 'Drivers cannot book their own ride.';
    END IF;

    -- Seat availability check
    IF seats_remaining < NEW.seats_booked THEN
        RAISE EXCEPTION 'Not enough seats available for this ride.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_booking_community_rule ON public.bookings;
CREATE TRIGGER trg_validate_booking_community_rule
    BEFORE INSERT ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_booking_community_rule();

-- Trigger 4: Manage seat count upon booking confirmation / cancellation
CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status != 'confirmed' AND NEW.status = 'confirmed' THEN
            UPDATE public.rides
            SET available_seats = available_seats - NEW.seats_booked
            WHERE id = NEW.ride_id;
        ELSIF OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'rejected') THEN
            UPDATE public.rides
            SET available_seats = available_seats + NEW.seats_booked
            WHERE id = NEW.ride_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_booking_status_change ON public.bookings;
CREATE TRIGGER trg_handle_booking_status_change
    AFTER UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_booking_status_change();

-- ============================================================================
-- SUPABASE ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PROFILES POLICIES
-- ----------------------------------------------------------------------------

-- Users can view their own profile and profiles within their same verified community
DROP POLICY IF EXISTS "profiles_select_same_community" ON public.profiles;
CREATE POLICY "profiles_select_same_community"
    ON public.profiles
    FOR SELECT
    USING (
        auth.uid() = id
        OR
        community_role = (SELECT community_role FROM public.profiles WHERE id = auth.uid())
    );

-- User can insert their own profile on registration
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- User can update their own personal info (Trigger prevents changing community_role)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- RIDES POLICIES (STRICT COMMUNITY SEPARATION)
-- ----------------------------------------------------------------------------

-- Policy 1: Members can ONLY view rides belonging to their verified community
DROP POLICY IF EXISTS "rides_select_community_only" ON public.rides;
CREATE POLICY "rides_select_community_only"
    ON public.rides
    FOR SELECT
    USING (
        community_role = (SELECT community_role FROM public.profiles WHERE id = auth.uid())
    );

-- Policy 2: Drivers can insert rides ONLY in their own community
DROP POLICY IF EXISTS "rides_insert_own_community" ON public.rides;
CREATE POLICY "rides_insert_own_community"
    ON public.rides
    FOR INSERT
    WITH CHECK (
        driver_id = auth.uid()
        AND
        community_role = (SELECT community_role FROM public.profiles WHERE id = auth.uid())
    );

-- Policy 3: Drivers can update only their own rides
DROP POLICY IF EXISTS "rides_update_own" ON public.rides;
CREATE POLICY "rides_update_own"
    ON public.rides
    FOR UPDATE
    USING (driver_id = auth.uid())
    WITH CHECK (driver_id = auth.uid());

-- Policy 4: Drivers can delete only their own rides
DROP POLICY IF EXISTS "rides_delete_own" ON public.rides;
CREATE POLICY "rides_delete_own"
    ON public.rides
    FOR DELETE
    USING (driver_id = auth.uid());

-- ----------------------------------------------------------------------------
-- BOOKINGS POLICIES (STRICT ROLE MATCHING)
-- ----------------------------------------------------------------------------

-- Passengers can view their own bookings; Drivers can view bookings on their rides
-- Both parties must belong to the ride's community
DROP POLICY IF EXISTS "bookings_select_participants" ON public.bookings;
CREATE POLICY "bookings_select_participants"
    ON public.bookings
    FOR SELECT
    USING (
        (passenger_id = auth.uid() OR ride_id IN (SELECT id FROM public.rides WHERE driver_id = auth.uid()))
        AND
        (SELECT community_role FROM public.rides WHERE id = public.bookings.ride_id) = 
        (SELECT community_role FROM public.profiles WHERE id = auth.uid())
    );

-- Passengers can only create bookings for rides in their own community
DROP POLICY IF EXISTS "bookings_insert_same_community" ON public.bookings;
CREATE POLICY "bookings_insert_same_community"
    ON public.bookings
    FOR INSERT
    WITH CHECK (
        passenger_id = auth.uid()
        AND
        (SELECT community_role FROM public.profiles WHERE id = auth.uid()) = 
        (SELECT community_role FROM public.rides WHERE id = ride_id)
    );

-- Passengers can cancel; Drivers can accept/reject (Driver cannot accept cross-community)
DROP POLICY IF EXISTS "bookings_update_participants" ON public.bookings;
CREATE POLICY "bookings_update_participants"
    ON public.bookings
    FOR UPDATE
    USING (
        passenger_id = auth.uid()
        OR
        ride_id IN (SELECT id FROM public.rides WHERE driver_id = auth.uid())
    );

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS POLICIES
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
    ON public.notifications
    FOR SELECT
    USING (
        user_id = auth.uid()
        AND
        community_role = (SELECT community_role FROM public.profiles WHERE id = auth.uid())
    );
