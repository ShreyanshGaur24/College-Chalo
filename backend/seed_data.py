"""
Seed database with realistic initial users, rides, and notifications
for all three communities: Student, Faculty, and Staff.
"""

from backend.database import get_connection, init_db
from backend.auth import hash_password
import uuid

def seed():
    init_db()
    conn = get_connection()
    cursor = conn.cursor()

    # Clear old data for a fresh clean state
    cursor.execute("DELETE FROM notifications;")
    cursor.execute("DELETE FROM bookings;")
    cursor.execute("DELETE FROM rides;")
    cursor.execute("DELETE FROM users;")

    default_pass = hash_password("Password123!")

    # 1. USERS
    users = [
        # --- STUDENTS ---
        {
            "id": "stu-rohan",
            "full_name": "Rohan Sharma",
            "email": "rohan.sharma@university.edu",
            "password_hash": default_pass,
            "university_name": "Delhi Technological University",
            "id_card_number": "STU-2026-8901",
            "avatar_url": "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80",
            "community_role": "student",
            "verification_status": "verified"
        },
        {
            "id": "stu-ananya",
            "full_name": "Ananya Patel",
            "email": "ananya.patel@university.edu",
            "password_hash": default_pass,
            "university_name": "Delhi Technological University",
            "id_card_number": "STU-2026-4412",
            "avatar_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
            "community_role": "student",
            "verification_status": "verified"
        },
        {
            "id": "stu-vikram",
            "full_name": "Vikram Singh",
            "email": "vikram.singh@university.edu",
            "password_hash": default_pass,
            "university_name": "Delhi Technological University",
            "id_card_number": "STU-2026-3109",
            "avatar_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
            "community_role": "student",
            "verification_status": "verified"
        },

        # --- FACULTY ---
        {
            "id": "fac-arun",
            "full_name": "Dr. Arun Sharma",
            "email": "dr.arun.sharma@university.edu",
            "password_hash": default_pass,
            "university_name": "Delhi Technological University",
            "id_card_number": "FAC-CS-104",
            "avatar_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
            "community_role": "faculty",
            "verification_status": "verified"
        },
        {
            "id": "fac-meera",
            "full_name": "Prof. Meera Sen",
            "email": "prof.meera.sen@university.edu",
            "password_hash": default_pass,
            "university_name": "Delhi Technological University",
            "id_card_number": "FAC-PH-209",
            "avatar_url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80",
            "community_role": "faculty",
            "verification_status": "verified"
        },
        {
            "id": "fac-rajiv",
            "full_name": "Dr. Rajiv Menon",
            "email": "dr.rajiv.menon@university.edu",
            "password_hash": default_pass,
            "university_name": "Delhi Technological University",
            "id_card_number": "FAC-EE-315",
            "avatar_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80",
            "community_role": "faculty",
            "verification_status": "verified"
        },

        # --- STAFF ---
        {
            "id": "stf-rajesh",
            "full_name": "Rajesh Verma",
            "email": "rajesh.verma@university.edu",
            "password_hash": default_pass,
            "university_name": "Delhi Technological University",
            "id_card_number": "STF-AD-551",
            "avatar_url": "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80",
            "community_role": "staff",
            "verification_status": "verified"
        },
        {
            "id": "stf-sunita",
            "full_name": "Sunita Rao",
            "email": "sunita.rao@university.edu",
            "password_hash": default_pass,
            "university_name": "Delhi Technological University",
            "id_card_number": "STF-LB-118",
            "avatar_url": "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80",
            "community_role": "staff",
            "verification_status": "verified"
        },
        {
            "id": "stf-amit",
            "full_name": "Amit Kulkarni",
            "email": "amit.kulkarni@university.edu",
            "password_hash": default_pass,
            "university_name": "Delhi Technological University",
            "id_card_number": "STF-FC-802",
            "avatar_url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=200&q=80",
            "community_role": "staff",
            "verification_status": "verified"
        }
    ]

    for u in users:
        cursor.execute("""
        INSERT INTO users (id, full_name, email, password_hash, university_name, id_card_number, avatar_url, community_role, verification_status)
        VALUES (:id, :full_name, :email, :password_hash, :university_name, :id_card_number, :avatar_url, :community_role, :verification_status)
        """, u)

    # 2. RIDES (Carefully assigned to matching driver community role)
    rides = [
        # Student Rides (Offered by students for students)
        {
            "id": "ride-stu-1",
            "driver_id": "stu-rohan",
            "community_role": "student",
            "origin": "North Campus Hostel Complex",
            "destination": "South Campus Tech Block",
            "departure_time": "Today, 08:30 AM",
            "vehicle_type": "car",
            "total_seats": 4,
            "available_seats": 3,
            "price_per_seat": 40.0,
            "car_model": "Tata Nexon EV (White)",
            "car_plate": "DL-01-AB-1234",
            "notes": "Daily morning student commute. AC on, study playlist playing. College ID check required at boarding.",
            "status": "active"
        },
        {
            "id": "ride-stu-2",
            "driver_id": "stu-ananya",
            "community_role": "student",
            "origin": "Cyber City Metro Station (Gate 2)",
            "destination": "Main University Gate 3",
            "departure_time": "Today, 09:15 AM",
            "vehicle_type": "bike",
            "total_seats": 1,
            "available_seats": 1,
            "price_per_seat": 30.0,
            "car_model": "Royal Enfield Hunter 350 (Black)",
            "car_plate": "HR-26-BK-5678",
            "notes": "Student 2-wheeler bike ride. Clean helmet provided for pillion passenger!",
            "status": "active"
        },
        {
            "id": "ride-stu-3",
            "driver_id": "stu-vikram",
            "community_role": "student",
            "origin": "Green Park Metro Interchange",
            "destination": "Computing Science & Innovation Block",
            "departure_time": "Today, 10:00 AM",
            "vehicle_type": "car",
            "total_seats": 3,
            "available_seats": 3,
            "price_per_seat": 45.0,
            "car_model": "Maruti Swift (Red)",
            "car_plate": "DL-04-EF-9012",
            "notes": "Direct to CS block before the 10:30 Lab sessions.",
            "status": "active"
        },

        # Faculty Rides (Offered by faculty for faculty)
        {
            "id": "ride-fac-1",
            "driver_id": "fac-arun",
            "community_role": "faculty",
            "origin": "Professors Enclave, Sector 15",
            "destination": "Academic Block A - Dean's Wing",
            "departure_time": "Today, 08:45 AM",
            "vehicle_type": "car",
            "total_seats": 3,
            "available_seats": 2,
            "price_per_seat": 75.0,
            "car_model": "Honda City Hybrid (Pearl White)",
            "car_plate": "DL-03-GH-3456",
            "notes": "Commute for faculty attending Senate and Department meetings. Quiet commute, ample space for laptops.",
            "status": "active"
        },
        {
            "id": "ride-fac-2",
            "driver_id": "fac-meera",
            "community_role": "faculty",
            "origin": "Faculty Housing Complex Phase 2",
            "destination": "Main Campus Science Complex",
            "departure_time": "Today, 09:30 AM",
            "vehicle_type": "bike",
            "total_seats": 1,
            "available_seats": 1,
            "price_per_seat": 25.0,
            "car_model": "TVS Jupiter 125 (Grey)",
            "car_plate": "DL-09-SC-7890",
            "notes": "Faculty 2-wheeler scooter commute. Quick and easy campus transit.",
            "status": "active"
        },

        # Staff Rides (Offered by staff for staff)
        {
            "id": "ride-stf-1",
            "driver_id": "stf-rajesh",
            "community_role": "staff",
            "origin": "Sector 14 Transit Hub & Metro",
            "destination": "Central Administrative Building (Gate 1)",
            "departure_time": "Today, 08:15 AM",
            "vehicle_type": "car",
            "total_seats": 4,
            "available_seats": 3,
            "price_per_seat": 35.0,
            "car_model": "Maruti Dzire (Silver)",
            "car_plate": "DL-02-LM-2345",
            "notes": "Morning staff shift commute. Prompt departure at 8:15 AM sharp to reach office before 9 AM biometric login.",
            "status": "active"
        },
        {
            "id": "ride-stf-2",
            "driver_id": "stf-sunita",
            "community_role": "staff",
            "origin": "Railway Station Staff Quarters",
            "destination": "Campus Facilities & Library Complex",
            "departure_time": "Today, 08:40 AM",
            "vehicle_type": "bike",
            "total_seats": 1,
            "available_seats": 1,
            "price_per_seat": 20.0,
            "car_model": "Honda Activa 6G (White)",
            "car_plate": "DL-08-BK-6789",
            "notes": "Staff 2-wheeler commute to Library and Registrar office.",
            "status": "active"
        }
    ]

    for r in rides:
        cursor.execute("""
        INSERT INTO rides (id, driver_id, community_role, origin, destination, departure_time, vehicle_type, total_seats, available_seats, price_per_seat, car_model, car_plate, notes, status)
        VALUES (:id, :driver_id, :community_role, :origin, :destination, :departure_time, :vehicle_type, :total_seats, :available_seats, :price_per_seat, :car_model, :car_plate, :notes, :status)
        """, r)


    # 3. SAMPLE BOOKINGS (STRICTLY WITHIN SAME COMMUNITY)
    bookings = [
        # Ananya (Student) booked 1 seat on Rohan's (Student) ride
        {
            "id": "bk-stu-1",
            "ride_id": "ride-stu-1",
            "passenger_id": "stu-ananya",
            "seats_booked": 1,
            "status": "confirmed",
            "booking_note": "Morning lab classes, thanks Rohan!"
        },
        # Dr. Rajiv Menon (Faculty) booked 1 seat on Dr. Arun's (Faculty) ride
        {
            "id": "bk-fac-1",
            "ride_id": "ride-fac-1",
            "passenger_id": "fac-rajiv",
            "seats_booked": 1,
            "status": "confirmed",
            "booking_note": "Heading to Academic Council meeting."
        },
        # Amit Kulkarni (Staff) booked 1 seat on Sunita's (Staff) ride
        {
            "id": "bk-stf-1",
            "ride_id": "ride-stf-2",
            "passenger_id": "stf-amit",
            "seats_booked": 1,
            "status": "confirmed",
            "booking_note": "Morning facility inspection shift."
        }
    ]

    for b in bookings:
        cursor.execute("""
        INSERT INTO bookings (id, ride_id, passenger_id, seats_booked, status, booking_note)
        VALUES (:id, :ride_id, :passenger_id, :seats_booked, :status, :booking_note)
        """, b)

    # 4. COMMUNITY NOTIFICATIONS
    notifications = [
        # Student Notifications
        {
            "id": str(uuid.uuid4()),
            "user_id": "stu-rohan",
            "community_role": "student",
            "title": "Booking Confirmed (Student Community)",
            "message": "Ananya Patel booked 1 seat for your ride from North Campus Hostel to South Campus Tech Block.",
            "type": "booking"
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": "stu-ananya",
            "community_role": "student",
            "title": "Student Community Safety Protocol",
            "message": "Always verify your driver's college ID badge and confirm car registration before boarding.",
            "type": "safety"
        },

        # Faculty Notifications
        {
            "id": str(uuid.uuid4()),
            "user_id": "fac-arun",
            "community_role": "faculty",
            "title": "Faculty Carpool Scheduled",
            "message": "Dr. Rajiv Menon joined your ride to Academic Block A. Departure scheduled for 08:45 AM.",
            "type": "booking"
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": "fac-meera",
            "community_role": "faculty",
            "title": "Faculty Commute Network",
            "message": "Exclusive faculty parking spaces in Block A are reserved for carpooling faculty members.",
            "type": "info"
        },

        # Staff Notifications
        {
            "id": str(uuid.uuid4()),
            "user_id": "stf-sunita",
            "community_role": "staff",
            "title": "Staff Ride Request Accepted",
            "message": "Amit Kulkarni confirmed seat on your commute to Campus Facilities.",
            "type": "booking"
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": "stf-rajesh",
            "community_role": "staff",
            "title": "Shift Timing Reminder",
            "message": "Biometric morning attendance window is 08:45 - 09:15 AM. Plan your commute accordingly.",
            "type": "info"
        }
    ]

    for n in notifications:
        cursor.execute("""
        INSERT INTO notifications (id, user_id, community_role, title, message, type)
        VALUES (:id, :user_id, :community_role, :title, :message, :type)
        """, n)

    conn.commit()
    conn.close()
    print("College-Chalo database successfully seeded with isolated communities.")

if __name__ == "__main__":
    seed()
