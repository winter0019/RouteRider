// src/types.ts

/* =========================
   ENUMS
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
   CORE MODELS
   (Designed to work with Firestore + older UI code)
========================= */

export type VehicleInfo = {
  make: string;        // e.g. Honda
  model: string;       // e.g. Accord
  plate_number: string;// e.g. FGE-123-TC
  color?: string;      // optional
};

export type DriverProfile = {
  user_id: string;                // firebase uid or generated id
  full_name: string;
  email?: string;
  phone_number: string;

  // Driver-only fields
  car_make?: string;
  car_model?: string;
  car_color?: string;
  plate_number?: string;

  verification_status: {
    phone: boolean;
    id: boolean;
    first_trip: boolean;
  };

  rating: number;
  trip_count: number;
  wallet_balance: number;
  total_earnings: number;

  profile_photo_url?: string;
};

export type Trip = {
  /* Firestore doc id */
  id: string;

  /* Backward compatibility with older UI */
  trip_id?: string;

  driver_id: string;       // uid
  driver_name: string;
  driver_phone: string;

  origin: string;
  destination: string;

  // ISO string for UI
  departure_time: string; // e.g. 2026-02-20T07:00:00.000Z

  // For search filters (optional)
  trip_date?: string; // YYYY-MM-DD
  trip_time?: string; // HH:mm

  seats_total: number;
  seats_booked: number;

  price_per_seat: number;

  status: TripStatus;

  vehicle: VehicleInfo;

  created_at: string; // ISO
};

export type Booking = {
  id: string;

  booking_id?: string; // backward compat

  trip_id: string;
  trip_doc_id?: string;

  passenger_id: string; // uid
  passenger_name?: string;
  passenger_phone?: string;
  passenger_photo?: string;
  passenger_rating?: number;
  passenger_trips?: number;

  seats: number;
  amount_paid: number;

  status: BookingStatus;

  created_at: string; // ISO
};

export type Transaction = {
  transaction_id: string;
  user_id: string | number;
  type: "deposit" | "withdrawal" | "commission";
  amount: number;
  description: string;
  created_at: string;
};

/* =========================
   HELPERS (Optional)
   Normalize any old trip shape to new shape safely
========================= */

export function normalizeTrip(t: any): Trip {
  const id = String(t.id ?? t.trip_id ?? "");
  const origin = String(t.origin ?? "");
  const destination = String(t.destination ?? "");
  const seatsTotal = Number(t.seats_total ?? t.seats_available ?? 0);
  const seatsBooked = Number(t.seats_booked ?? 0);

  return {
    id,
    trip_id: t.trip_id ?? id,
    driver_id: String(t.driver_id ?? t.carOwnerId ?? ""),
    driver_name: String(t.driver_name ?? t.driverName ?? "Driver"),
    driver_phone: String(t.driver_phone ?? t.driverPhone ?? "N/A"),
    origin,
    destination,
    departure_time: String(t.departure_time ?? t.time ?? new Date().toISOString()),
    trip_date: t.trip_date,
    trip_time: t.trip_time,
    seats_total: seatsTotal,
    seats_booked: seatsBooked,
    price_per_seat: Number(t.price_per_seat ?? t.price ?? 0),
    status: (t.status as TripStatus) ?? TripStatus.POSTED,
    vehicle: {
      make: String(t.vehicle?.make ?? t.car_make ?? "N/A"),
      model: String(t.vehicle?.model ?? t.car_model ?? "N/A"),
      plate_number: String(t.vehicle?.plate_number ?? t.plate_number ?? "N/A"),
      color: t.vehicle?.color ?? t.car_color,
    },
    created_at: String(t.created_at ?? new Date().toISOString()),
  };
}
