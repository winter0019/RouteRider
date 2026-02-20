// src/types.ts

/* =========================
   ENUMS / STATUS
========================= */

export enum TripStatus {
  POSTED = "POSTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum BookingStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}

/* =========================
   CORE TYPES
========================= */

export type UserRole = "driver" | "passenger";

/**
 * Trip
 * - Supports Firestore IDs (string) and SQL IDs (number) using BOTH:
 *    trip_id (string)  -> Firestore document id
 *    id (number)       -> SQL primary key
 * - Use whichever exists in your current storage.
 */
export type Trip = {
  // Firestore style
  trip_id: string;

  // SQL/API style (optional)
  id?: number;

  // Who posted it (driver)
  driver_id?: string;        // UI usage
  driver_user_id?: number;   // SQL usage
  carOwnerId?: string;       // Firestore usage

  // Route info
  origin?: string;
  destination?: string;
  route: string;             // e.g. "Kano → Katsina"
  departure_time: string;    // ISO string

  // Seats
  seats_available: number;   // total seats available
  seats_booked: number;      // already booked seats

  // Price
  price_per_seat?: number;

  // ✅ Vehicle info (IMPORTANT FIX)
  vehicle_name?: string;     // e.g. "Honda Accord"
  plate_number?: string;     // e.g. "FGE-123-TC"

  // Status
  status: TripStatus;

  // Extras
  earnings?: number;
  created_at?: string;

  // Firestore-only helpers
  bookedBy?: string[];       // array of userIds who booked (Firestore)
};

/**
 * Booking
 * - Supports Firestore list-style bookings AND SQL/API bookings.
 */
export type Booking = {
  // SQL/API style
  id?: number;

  // Firestore/UI style
  booking_id?: string;

  // Trip reference
  trip_id: string | number;

  // Passenger
  passenger_id?: string;
  passenger_phone?: string;
  passenger_name?: string;
  passenger_photo?: string;
  passenger_rating?: number;
  passenger_trips?: number;

  // Booking details
  seats: number;             // seats requested/paid for
  amount_paid: number;

  status: BookingStatus;
  created_at: string;
};

/**
 * Driver / Passenger Profile
 * - Used by onboarding + wallet + profile pages.
 */
export type DriverProfile = {
  user_id: string;                 // Firestore uid or local id
  role: UserRole;

  full_name: string;
  phone: string;

  profile_photo_url?: string;

  // ✅ Vehicle info (used for posting trips)
  vehicle_name?: string;           // "Honda Accord"
  plate_number?: string;           // "FGE-123-TC"

  // Wallet stats
  wallet_balance: number;
  total_earnings: number;
  trip_count: number;

  // Verification
  is_verified?: boolean;
  id_status?: "ACTIVE" | "PENDING" | "REJECTED" | "UNVERIFIED";
};

/**
 * Transaction
 */
export type Transaction = {
  transaction_id: string;

  user_id: string | number;

  type: "deposit" | "withdrawal" | "charge" | "refund";
  amount: number;

  description: string;
  created_at: string;
};
