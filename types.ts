
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
  COMPLETED = 'completed'
}

export interface User {
  user_id: string;
  phone_number: string;
  full_name: string;
  profile_photo_url?: string;
  verification_status: {
    phone: boolean;
    id: boolean;
    first_trip: boolean;
  };
  rating: number;
  trip_count: number;
}

export interface DriverProfile extends User {
  car_make: string;
  car_model: string;
  car_color: string;
  plate_number: string;
  wallet_balance: number;
  total_earnings: number;
}

export interface Trip {
  trip_id: string;
  driver_id: string;
  driver_name?: string;
  car_details?: string;
  carOwnerId?: string; // For Firestore compatibility
  origin?: string;
  destination?: string;
  time?: string;
  bookedBy?: string[];
  route: string;
  departure_time: string;
  seats_available: number;
  seats_booked: number;
  status: TripStatus;
  earnings: number;
  created_at: string;
}

export interface Booking {
  booking_id: string;
  trip_id: string;
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
