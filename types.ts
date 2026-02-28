
export enum TripStatus {
  POSTED = 'posted',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum BookingStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  NO_SHOW = 'no_show',
  COMPLETED = 'completed',
  ESCROWED = 'escrowed'
}

export interface User {
  user_id: string;
  phone_number: string;
  full_name: string;
  email?: string;
  profile_photo_url?: string;
  kyc_status: 'none' | 'pending' | 'verified' | 'failed';
  name_locked: boolean;
  name_correction_used: boolean;
  verification_status: {
    phone: boolean;
    id: boolean;
    first_trip: boolean;
  };
  rating: number;
  trip_count: number;
  isAdmin?: boolean;
  fcmToken?: string;
}

export interface DriverProfile extends User {
  car_make: string;
  car_model: string;
  car_color: string;
  plate_number: string;
  wallet_balance: number;
  total_earnings: number;
  bank_name?: string;
  bank_code?: string;
  account_number?: string;
  account_name?: string;
  recipient_code?: string;
  payout_enabled?: boolean;
  preferred_routes?: string[];
  preferred_areas?: string[];
}

export interface Trip {
  trip_id: string;
  driver_id: string;
  driver_name?: string;
  car_details?: string;
  carOwnerId?: string; // For Firestore compatibility
  origin?: string;
  destination?: string;
  origin_key?: string;
  destination_key?: string;
  id?: string;
  source?: 'rides' | 'trips';
  time?: string;
  bookedBy?: string[];
  route: string;
  departure_time: string;
  price_per_seat: number;
  vehicle_name?: string;
  seats_available: number;
  seats_booked: number;
  status: TripStatus;
  earnings: number;
  created_at: string;
  expires_at?: string;
  pickup_area?: string;
  pickup_landmark?: string;
  pickup_notes?: string;
}

export interface Booking {
  booking_id: string;
  trip_id: string;
  driver_id: string;
  passenger_id: string;
  passenger_name: string;
  passenger_photo?: string;
  passenger_rating: number;
  passenger_trips: number;
  seats_booked: number;
  amount_paid: number;
  status: BookingStatus;
  created_at: string;
}

export interface Transaction {
  transaction_id: string;
  user_id: string;
  type: 'deposit' | 'withdrawal' | 'commission' | 'compensation';
  amount: number;
  description: string;
  created_at: string;
}
