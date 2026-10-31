"""
College-Chalo Database Layer
Implements strict role-based integrity, SQLite constraints, and database triggers
enforcing student, faculty, and staff community separation independently of UI.
"""

import sqlite3
import os
import uuid
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "college_chalo.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Profiles Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        university_name TEXT NOT NULL,
        id_card_number TEXT,
        avatar_url TEXT,
        community_role TEXT NOT NULL CHECK (community_role IN ('student', 'faculty', 'staff')),
        verification_status TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('pending_review', 'verified', 'rejected')),
        verification_doc TEXT,
        verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Rides Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rides (
        id TEXT PRIMARY KEY,
        driver_id TEXT NOT NULL,
        community_role TEXT NOT NULL CHECK (community_role IN ('student', 'faculty', 'staff')),
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        departure_time TEXT NOT NULL,
        vehicle_type TEXT NOT NULL DEFAULT 'car' CHECK (vehicle_type IN ('bike', 'car')),
        total_seats INTEGER NOT NULL CHECK (total_seats > 0),
        available_seats INTEGER NOT NULL CHECK (available_seats >= 0),
        price_per_seat REAL NOT NULL DEFAULT 0.0,
        car_model TEXT,
        car_plate TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Migration check for existing SQLite databases
    try:
        cursor.execute("ALTER TABLE rides ADD COLUMN vehicle_type TEXT NOT NULL DEFAULT 'car' CHECK (vehicle_type IN ('bike', 'car'));")
    except sqlite3.OperationalError:
        pass


    # 3. Bookings Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        ride_id TEXT NOT NULL,
        passenger_id TEXT NOT NULL,
        seats_booked INTEGER NOT NULL DEFAULT 1 CHECK (seats_booked > 0),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
        booking_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
        FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (ride_id, passenger_id)
    );
    """)

    # 4. Notifications Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        community_role TEXT NOT NULL CHECK (community_role IN ('student', 'faculty', 'staff')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'system',
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 5. DATABASE TRIGGERS ENFORCING BUSINESS RULES AT THE DATABASE LEVEL

    # Drop old triggers if they exist
    cursor.execute("DROP TRIGGER IF EXISTS trg_prevent_role_update;")
    cursor.execute("DROP TRIGGER IF EXISTS trg_enforce_ride_role_match;")
    cursor.execute("DROP TRIGGER IF EXISTS trg_prevent_cross_community_booking;")

    # Trigger A: Prevent direct user profile community_role manipulation
    cursor.execute("""
    CREATE TRIGGER trg_prevent_role_update
    BEFORE UPDATE OF community_role ON users
    FOR EACH ROW
    WHEN OLD.community_role IS NOT NEW.community_role
    BEGIN
        SELECT RAISE(ABORT, 'Category change requires an authorized verification process. Direct role modification is strictly prohibited.');
    END;
    """)

    # Trigger B: Enforce that ride community_role must strictly match driver verified role
    cursor.execute("""
    CREATE TRIGGER trg_enforce_ride_role_match
    BEFORE INSERT ON rides
    FOR EACH ROW
    BEGIN
        SELECT RAISE(ABORT, 'Ride community category must match driver verified role.')
        WHERE NEW.community_role != (
            SELECT community_role FROM users WHERE id = NEW.driver_id
        );
    END;
    """)

    # Trigger C: Strict Cross-Community Booking Enforcer
    # Exact required error message: "This ride is available only to members of your own college community."
    cursor.execute("""
    CREATE TRIGGER trg_prevent_cross_community_booking
    BEFORE INSERT ON bookings
    FOR EACH ROW
    BEGIN
        SELECT RAISE(ABORT, 'This ride is available only to members of your own college community.')
        WHERE (
            SELECT community_role FROM users WHERE id = NEW.passenger_id
        ) != (
            SELECT community_role FROM rides WHERE id = NEW.ride_id
        );
    END;
    """)

    # Trigger D: Enforce that 2-wheelers (bikes) can only offer 1 passenger seat
    cursor.execute("DROP TRIGGER IF EXISTS trg_enforce_bike_seats;")
    cursor.execute("""
    CREATE TRIGGER trg_enforce_bike_seats
    BEFORE INSERT ON rides
    FOR EACH ROW
    WHEN NEW.vehicle_type = 'bike' AND NEW.total_seats > 1
    BEGIN
        SELECT RAISE(ABORT, 'A 2-wheeler (bike) can only offer 1 passenger seat.');
    END;
    """)

    cursor.execute("DROP TRIGGER IF EXISTS trg_enforce_bike_seats_update;")
    cursor.execute("""
    CREATE TRIGGER trg_enforce_bike_seats_update
    BEFORE UPDATE ON rides
    FOR EACH ROW
    WHEN NEW.vehicle_type = 'bike' AND NEW.total_seats > 1
    BEGIN
        SELECT RAISE(ABORT, 'A 2-wheeler (bike) can only offer 1 passenger seat.');
    END;
    """)

    # Trigger E: Enforce that bookings on 2-wheelers (bikes) cannot exceed 1 seat
    cursor.execute("DROP TRIGGER IF EXISTS trg_enforce_bike_booking_seats;")
    cursor.execute("""
    CREATE TRIGGER trg_enforce_bike_booking_seats
    BEFORE INSERT ON bookings
    FOR EACH ROW
    WHEN NEW.seats_booked > 1 AND (SELECT vehicle_type FROM rides WHERE id = NEW.ride_id) = 'bike'
    BEGIN
        SELECT RAISE(ABORT, 'Cannot book more than 1 seat on a 2-wheeler (bike).');
    END;
    """)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    
    print("Database initialized successfully with strict triggers and constraints.")
