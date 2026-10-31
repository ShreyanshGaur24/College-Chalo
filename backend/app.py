"""
College-Chalo REST API & Web Application Server
Strict role-based ride sharing backend enforcing Student, Faculty, and Staff communities.
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import uuid
import sqlite3
from datetime import datetime

from backend.database import get_connection, init_db
from backend.auth import hash_password, verify_password, create_token, get_user_from_token
from backend.test_scenarios import run_all_tests
from backend.seed_data import seed

app = Flask(__name__, static_folder="../static", static_url_path="/static")
CORS(app)

# Ensure DB is initialized
init_db()

def get_auth_user():
    """Extract and authenticate user from Authorization header"""
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
    elif request.cookies.get("cc_token"):
        token = request.cookies.get("cc_token")

    if not token:
        return None
    return get_user_from_token(token)

def require_auth():
    """Helper returning (user, error_response)"""
    user = get_auth_user()
    if not user:
        return None, (jsonify({"error": "Authentication required. Please sign in."}), 401)
    return user, None

# -----------------------------------------------------------------------------
# AUTHENTICATION & REGISTRATION ENDPOINTS
# -----------------------------------------------------------------------------

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    full_name = data.get("full_name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    community_role = data.get("community_role", "").strip().lower()
    university_name = data.get("university_name", "").strip()
    id_card_number = data.get("id_card_number", "").strip()
    avatar_url = data.get("avatar_url", "").strip()

    # Validation
    if community_role not in ["student", "faculty", "staff"]:
        return jsonify({"error": "Invalid community role. Must be 'student', 'faculty', or 'staff'."}), 400

    if not full_name or not email or not password or not university_name:
        return jsonify({"error": "Full name, email, password, and university name are required."}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters long."}), 400

    # Role specific ID requirements
    if community_role == "student" and not id_card_number:
        return jsonify({"error": "Student ID or University UID is required for student registration."}), 400
    elif community_role == "faculty" and not id_card_number:
        return jsonify({"error": "Faculty / Employee ID is required for faculty registration."}), 400
    elif community_role == "staff" and not id_card_number:
        return jsonify({"error": "Staff ID / Employee ID is required for college staff registration."}), 400

    # Fallback default avatars
    if not avatar_url:
        role_avatars = {
            "student": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80",
            "faculty": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
            "staff": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80"
        }
        avatar_url = role_avatars[community_role]

    user_id = f"{community_role[:3]}-{uuid.uuid4().hex[:8]}"
    pwd_hash = hash_password(password)

    conn = get_connection()
    cursor = conn.cursor()

    # Check email duplicate
    existing = cursor.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        conn.close()
        return jsonify({"error": "An account with this email address already exists."}), 409

    try:
        cursor.execute("""
        INSERT INTO users (id, full_name, email, password_hash, university_name, id_card_number, avatar_url, community_role, verification_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verified')
        """, (user_id, full_name, email, pwd_hash, university_name, id_card_number, avatar_url, community_role))

        # Welcome notification
        cursor.execute("""
        INSERT INTO notifications (id, user_id, community_role, title, message, type)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            str(uuid.uuid4()),
            user_id,
            community_role,
            f"Welcome to the {community_role.capitalize()} Community!",
            f"Your account and {community_role.capitalize()} status have been verified for {university_name}.",
            "welcome"
        ))

        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"error": f"Registration failed: {str(e)}"}), 500

    user_data = dict(cursor.execute("SELECT id, full_name, email, university_name, id_card_number, avatar_url, community_role, verification_status, created_at FROM users WHERE id = ?", (user_id,)).fetchone())
    conn.close()

    token = create_token(user_id, community_role)
    return jsonify({
        "message": f"Successfully joined the {community_role.capitalize()} Community!",
        "token": token,
        "user": user_data
    }), 201

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    conn = get_connection()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()

    if not user or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid email or password."}), 401

    token = create_token(user["id"], user["community_role"])
    user_dict = dict(user)
    user_dict.pop("password_hash", None)

    return jsonify({
        "message": f"Welcome back, {user['full_name']}!",
        "token": token,
        "user": user_dict
    }), 200

@app.route("/api/auth/me", methods=["GET"])
def get_me():
    user, err = require_auth()
    if err:
        return err
    user.pop("password_hash", None)
    return jsonify({"user": user}), 200

@app.route("/api/auth/demo-switch", methods=["POST"])
def demo_switch():
    """Quick demo switch to allow evaluators to instantly test Student, Faculty, and Staff views"""
    data = request.get_json() or {}
    role = data.get("role", "student").lower()

    conn = get_connection()
    user = conn.execute("SELECT * FROM users WHERE community_role = ? LIMIT 1", (role,)).fetchone()
    conn.close()

    if not user:
        return jsonify({"error": f"No seed user found for role {role}"}), 404

    token = create_token(user["id"], user["community_role"])
    user_dict = dict(user)
    user_dict.pop("password_hash", None)

    return jsonify({
        "message": f"Switched to demo {role} account ({user['full_name']})",
        "token": token,
        "user": user_dict
    }), 200

@app.route("/api/auth/profile/update", methods=["POST"])
def update_profile():
    user, err = require_auth()
    if err:
        return err

    data = request.get_json() or {}

    # RULE ENFORCEMENT: Users must not be allowed to change their category simply by editing their profile!
    if "community_role" in data and data["community_role"] != user["community_role"]:
        return jsonify({
            "error": "Category change requires an authorized verification process. Direct role modification is strictly prohibited."
        }), 403

    full_name = data.get("full_name", user["full_name"]).strip()
    avatar_url = data.get("avatar_url", user["avatar_url"]).strip()

    conn = get_connection()
    try:
        conn.execute("UPDATE users SET full_name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                     (full_name, avatar_url, user["id"]))
        conn.commit()
    except sqlite3.DatabaseError as db_err:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(db_err)}), 403

    updated_user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())
    conn.close()
    updated_user.pop("password_hash", None)

    return jsonify({
        "message": "Profile updated successfully.",
        "user": updated_user
    }), 200

# -----------------------------------------------------------------------------
# RIDE-SHARING ENDPOINTS (STRICT COMMUNITY SEGREGATION)
# -----------------------------------------------------------------------------

@app.route("/api/rides", methods=["GET"])
def get_rides():
    """
    Search and list rides.
    STRICT BUSINESS RULE:
    - Students see Student rides ONLY.
    - Faculty see Faculty rides ONLY.
    - Staff see Staff rides ONLY.
    """
    user, err = require_auth()
    if err:
        return err

    community_role = user["community_role"]

    search_origin = request.args.get("origin", "").strip()
    search_dest = request.args.get("destination", "").strip()

    conn = get_connection()
    cursor = conn.cursor()

    query = """
    SELECT r.*,
           u.full_name as driver_name,
           u.avatar_url as driver_avatar,
           u.university_name as driver_university,
           u.verification_status as driver_verification,
           u.id_card_number as driver_card_id
    FROM rides r
    JOIN users u ON r.driver_id = u.id
    WHERE r.community_role = ? AND r.status = 'active'
    """
    params = [community_role]

    search_date = request.args.get("date", "").strip()

    if search_origin:
        query += " AND r.origin LIKE ?"
        params.append(f"%{search_origin}%")

    if search_dest:
        query += " AND r.destination LIKE ?"
        params.append(f"%{search_dest}%")

    if search_date:
        query += " AND r.departure_time LIKE ?"
        params.append(f"%{search_date}%")

    query += " ORDER BY r.departure_time ASC"

    cursor.execute(query, params)
    rides = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({
        "community_role": community_role,
        "count": len(rides),
        "rides": rides
    }), 200

@app.route("/api/rides", methods=["POST"])
def create_ride():
    """
    Publish a new ride.
    RULE ENFORCEMENT:
    1. Driver verified role determines ride community_role.
    2. Users cannot forge or publish a ride in a different community.
    """
    user, err = require_auth()
    if err:
        return err

    data = request.get_json() or {}
    driver_role = user["community_role"]

    # Reject if user tries to publish outside their community
    submitted_role = data.get("community_role")
    if submitted_role and submitted_role != driver_role:
        return jsonify({
            "error": f"Unauthorized: As a {driver_role}, you can only publish rides in the {driver_role} community."
        }), 403

    origin = data.get("origin", "").strip()
    destination = data.get("destination", "").strip()
    departure_time = data.get("departure_time", "").strip()
    vehicle_type = data.get("vehicle_type", "car").strip().lower()
    if vehicle_type not in ["bike", "car"]:
        vehicle_type = "car"

    if vehicle_type == "bike":
        total_seats = 1
    else:
        total_seats = int(data.get("total_seats", 3))

    price_per_seat = float(data.get("price_per_seat", 0.0))
    car_model = data.get("car_model", "").strip()
    car_plate = data.get("car_plate", "").strip()
    notes = data.get("notes", "").strip()

    if not origin or not destination or not departure_time:
        return jsonify({"error": "Origin, destination, and departure time are required."}), 400

    if total_seats <= 0:
        return jsonify({"error": "Available seats must be greater than 0."}), 400

    ride_id = f"ride-{driver_role[:3]}-{uuid.uuid4().hex[:8]}"

    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
        INSERT INTO rides (id, driver_id, community_role, origin, destination, departure_time, vehicle_type, total_seats, available_seats, price_per_seat, car_model, car_plate, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        """, (ride_id, user["id"], driver_role, origin, destination, departure_time, vehicle_type, total_seats, total_seats, price_per_seat, car_model, car_plate, notes))

        conn.commit()

    except sqlite3.DatabaseError as db_err:
        conn.rollback()
        conn.close()
        return jsonify({"error": f"Database error publishing ride: {str(db_err)}"}), 400

    new_ride = dict(cursor.execute("SELECT * FROM rides WHERE id = ?", (ride_id,)).fetchone())
    conn.close()

    return jsonify({
        "message": f"Successfully published ride in {driver_role.capitalize()} Community!",
        "ride": new_ride
    }), 201

# -----------------------------------------------------------------------------
# BOOKING ENDPOINTS (STRICT VALIDATION)
# -----------------------------------------------------------------------------

@app.route("/api/rides/<ride_id>/book", methods=["POST"])
def book_ride(ride_id):
    """
    Request a booking.
    STRICT BUSINESS RULE & VALIDATION:
    - Passenger is authenticated
    - Passenger's role has been verified
    - Driver's role has been verified
    - Passenger and ride belong to the EXACT SAME community category
    - Ride is active and has sufficient available seats
    - Booking request is valid and not a duplicate
    - If roles do not match, reject with exact message:
      "This ride is available only to members of your own college community."
    """
    user, err = require_auth()
    if err:
        return err

    data = request.get_json() or {}
    seats_booked = int(data.get("seats_booked", 1))
    booking_note = data.get("booking_note", "").strip()

    conn = get_connection()
    cursor = conn.cursor()

    # 1. Fetch Ride
    ride = cursor.execute("""
    SELECT r.*, u.community_role as driver_role, u.verification_status as driver_verification, u.full_name as driver_name
    FROM rides r
    JOIN users u ON r.driver_id = u.id
    WHERE r.id = ?
    """, (ride_id,)).fetchone()

    if not ride:
        conn.close()
        return jsonify({"error": "Ride not found."}), 404

    # 2. Prevent Driver from booking own ride
    if ride["driver_id"] == user["id"]:
        conn.close()
        return jsonify({"error": "You cannot book your own ride."}), 400

    # 3. Community Role Match Validation
    if user["community_role"] != ride["community_role"]:
        conn.close()
        # EXACT SPECIFICATION STRING:
        return jsonify({
            "error": "This ride is available only to members of your own college community.",
            "code": "COMMUNITY_MISMATCH"
        }), 403

    # 4. Verification Check
    if user["verification_status"] != "verified":
        conn.close()
        return jsonify({"error": "Your community role must be verified to book rides."}), 403

    # 5. Status & Seat Check
    if ride["status"] != "active":
        conn.close()
        return jsonify({"error": "This ride is no longer active."}), 400

    if ride["vehicle_type"] == "bike" and seats_booked > 1:
        conn.close()
        return jsonify({"error": "Bike rides only have 1 passenger seat available."}), 400

    if ride["available_seats"] < seats_booked:
        conn.close()
        return jsonify({"error": f"Only {ride['available_seats']} seat(s) available."}), 400

    # 6. Duplicate Booking Check
    existing_bk = cursor.execute("""
    SELECT id FROM bookings WHERE ride_id = ? AND passenger_id = ? AND status IN ('pending', 'confirmed')
    """, (ride_id, user["id"])).fetchone()

    if existing_bk:
        conn.close()
        return jsonify({"error": "You have already booked a seat on this ride."}), 409

    # 7. Create Booking
    booking_id = f"bk-{uuid.uuid4().hex[:8]}"

    try:
        cursor.execute("""
        INSERT INTO bookings (id, ride_id, passenger_id, seats_booked, status, booking_note)
        VALUES (?, ?, ?, ?, 'confirmed', ?)
        """, (booking_id, ride_id, user["id"], seats_booked, booking_note))

        # Decrement available seats
        cursor.execute("""
        UPDATE rides SET available_seats = available_seats - ? WHERE id = ?
        """, (seats_booked, ride_id))

        # Notification to Driver
        cursor.execute("""
        INSERT INTO notifications (id, user_id, community_role, title, message, type)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            str(uuid.uuid4()),
            ride["driver_id"],
            ride["community_role"],
            f"New {ride['community_role'].capitalize()} Booking",
            f"{user['full_name']} booked {seats_booked} seat(s) on your ride to {ride['destination']}.",
            "booking"
        ))

        # Notification to Passenger
        cursor.execute("""
        INSERT INTO notifications (id, user_id, community_role, title, message, type)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            str(uuid.uuid4()),
            user["id"],
            user["community_role"],
            f"Ride Confirmed ({user['community_role'].capitalize()} Community)",
            f"Your seat on {ride['driver_name']}'s ride to {ride['destination']} has been confirmed.",
            "booking"
        ))

        conn.commit()
    except sqlite3.DatabaseError as db_err:
        conn.rollback()
        conn.close()
        return jsonify({"error": str(db_err)}), 400

    new_booking = dict(cursor.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,)).fetchone())
    conn.close()

    return jsonify({
        "message": "Ride booking confirmed successfully!",
        "booking": new_booking
    }), 201

@app.route("/api/bookings", methods=["GET"])
def get_user_bookings():
    """
    Get user bookings (both as passenger and as driver).
    Strictly scoped to user's community.
    """
    user, err = require_auth()
    if err:
        return err

    conn = get_connection()
    cursor = conn.cursor()

    # As passenger
    cursor.execute("""
    SELECT b.*,
           r.origin, r.destination, r.departure_time, r.price_per_seat, r.car_model, r.car_plate, r.community_role,
           u.full_name as driver_name, u.avatar_url as driver_avatar, u.id_card_number as driver_card_id
    FROM bookings b
    JOIN rides r ON b.ride_id = r.id
    JOIN users u ON r.driver_id = u.id
    WHERE b.passenger_id = ? AND r.community_role = ?
    ORDER BY b.created_at DESC
    """, (user["id"], user["community_role"]))
    passenger_bookings = [dict(row) for row in cursor.fetchall()]

    # As driver (incoming requests)
    cursor.execute("""
    SELECT b.*,
           r.origin, r.destination, r.departure_time, r.community_role,
           p.full_name as passenger_name, p.avatar_url as passenger_avatar, p.id_card_number as passenger_card_id
    FROM bookings b
    JOIN rides r ON b.ride_id = r.id
    JOIN users p ON b.passenger_id = p.id
    WHERE r.driver_id = ? AND r.community_role = ?
    ORDER BY b.created_at DESC
    """, (user["id"], user["community_role"]))
    driver_bookings = [dict(row) for row in cursor.fetchall()]

    conn.close()

    return jsonify({
        "passenger_bookings": passenger_bookings,
        "driver_bookings": driver_bookings
    }), 200

@app.route("/api/notifications", methods=["GET"])
def get_notifications():
    user, err = require_auth()
    if err:
        return err

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM notifications
    WHERE user_id = ? AND community_role = ?
    ORDER BY created_at DESC
    LIMIT 20
    """, (user["id"], user["community_role"]))
    notifications = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({"notifications": notifications}), 200

# -----------------------------------------------------------------------------
# INTERACTIVE TEST SUITE API
# -----------------------------------------------------------------------------

@app.route("/api/tests/run", methods=["POST"])
def execute_test_suite():
    """Execute all 12 mandatory test scenarios and return JSON report"""
    test_results = run_all_tests()
    all_passed = all(t["passed"] for t in test_results)
    return jsonify({
        "success": all_passed,
        "total_tests": len(test_results),
        "passed_tests": sum(1 for t in test_results if t["passed"]),
        "failed_tests": sum(1 for t in test_results if not t["passed"]),
        "results": test_results
    }), 200

# -----------------------------------------------------------------------------
# STATIC FILE SERVING
# -----------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/<path:path>")
def static_proxy(path):
    return send_from_directory(app.static_folder, path)

if __name__ == "__main__":
    print("\n🚀 Starting College-Chalo Platform on http://127.0.0.1:5000")
    print("✨ Community roles: Student, Faculty, Staff with strict separation & RLS.")
    app.run(host="127.0.0.1", port=5000, debug=False)
