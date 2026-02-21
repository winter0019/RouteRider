// /types.ts

export type UserRole = "driver" | "passenger";

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

export type VerificationStatus = {
  phone: boolean;
  id: boolean;        // NIN verified
  first_trip: boolean;
};

export type DriverProfile = {
  user_id: string;
  full_name: string;
  email?: string;
  phone_number: string;

  // Vehicle info (drivers only)
  car_make: string;
  car_model: string;
  car_color?: string;
  plate_number: string;

  // Verification
  verification_status: VerificationStatus;

  // Wallet / stats
  rating: number;
  trip_count: number;
  wallet_balance: number;
  total_earnings: number;

  // Optional photo
  profile_photo_url?: string;

  // Optional role helper
  userType?: UserRole;
};

export type Trip = {
  // UI expects trip_id everywhere
  trip_id: string;

  // owner
  driver_id: string;         // Firebase uid
  driver_name?: string;
  driver_phone?: string;

  // route
  origin: string;
  destination: string;

  // time: ISO string
  departure_time: string;

  // seats
  seats_available: number;    // total seats offered
  seats_booked: number;       // number already booked
  bookedBy?: string[];        // list of passenger uids

  // price
  price_per_seat: number;

  // vehicle (THIS FIXES “Toyota Corolla” showing for everyone)
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  plate_number?: string;

  // convenience display fields (optional)
  route?: string;            // "Kano → Katsina"
  vehicle_name?: string;     // "Honda Accord"

  // status
  status: TripStatus;

  // earnings (optional)
  earnings?: number;

  // created time
  created_at: string;        // ISO string
};

export type Booking = {
  booking_id: string;
  trip_id: string;

  passenger_id: string;
  passenger_name: string;
  passenger_photo?: string;

  passenger_rating?: number;
  passenger_trips?: number;

  seats_booked: number;
  amount_paid: number;

  status: BookingStatus;
  created_at: string;
};

export type TransactionType = "deposit" | "withdrawal" | "hold" | "release";

export type Transaction = {
  transaction_id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  description: string;
  created_at: string;
};
