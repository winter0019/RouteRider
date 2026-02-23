
import React, { useEffect, useState } from 'react';
import { Booking, BookingStatus, Trip, TripStatus, DriverProfile, Transaction } from '../types';
import { ICONS, COLORS, ROUTES } from '../constants';
import { api } from '../services/api';

interface BookingManagementProps {
  bookings: Booking[];
  setBookings: (newBookings: Booking[]) => void;
  activeTrip: Trip | null;
  setActiveTrip: (trip: Trip | null) => void;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  setProfile: React.Dispatch<React.SetStateAction<DriverProfile | null>>;
}

const BookingManagement: React.FC<BookingManagementProps> = ({ 
  bookings, setBookings, activeTrip, setActiveTrip, setTransactions, setProfile 
}) => {
  const [viewingPassenger, setViewingPassenger] = useState<Booking | null>(null);

  // No mock bookings - use real data from Firestore
  useEffect(() => {
    // This was previously adding a mock booking for Sarah O.
  }, []);

  const handleAction = async (booking: Booking, action: 'accept' | 'reject') => {
    const status = action === 'accept' ? BookingStatus.ACCEPTED : BookingStatus.REJECTED;
    
    try {
      await api.updateBookingStatus(booking.booking_id, status);
      
      if (action === 'reject' && activeTrip) {
        // If rejected, we need to free up the seat that was reserved
        await api.cancelBooking(activeTrip.trip_id, activeTrip.source as any);
      }

      const updatedBookings = bookings.map(b => 
        b.booking_id === booking.booking_id 
        ? { ...b, status }
        : b
      );
      setBookings(updatedBookings);

      if (action === 'accept' && activeTrip) {
        const newSeatsBooked = activeTrip.seats_booked; // Already incremented by passenger
        const isFull = newSeatsBooked >= activeTrip.seats_available;
        const newTripStatus = isFull ? TripStatus.IN_PROGRESS : TripStatus.POSTED;
        
        if (newTripStatus !== activeTrip.status) {
          await api.updateTripStatus(activeTrip.trip_id, newTripStatus, activeTrip.source as any);
        }

        setActiveTrip({
          ...activeTrip,
          status: newTripStatus,
          seats_booked: newSeatsBooked
        });
      } else if (action === 'reject' && activeTrip) {
        setActiveTrip({
          ...activeTrip,
          seats_booked: Math.max(0, activeTrip.seats_booked - 1)
        });
      }
    } catch (error) {
      console.error('Failed to update booking status:', error);
    }
    setViewingPassenger(null);
  };

  const [isCompleting, setIsCompleting] = useState(false);

  const completeTrip = async () => {
    if (!activeTrip) return;
    setIsCompleting(true);

    try {
      // Release escrow for all accepted bookings
      const accepted = bookings.filter(b => b.status === BookingStatus.ACCEPTED);
      for (const booking of accepted) {
        await api.completeBooking(booking.booking_id);
      }

      // Remove from Firestore
      await api.deleteTrip(activeTrip.trip_id);

      // Refresh profile to get new balance
      const updatedProfile = await api.getProfile(activeTrip.driver_id);
      if (updatedProfile) {
        setProfile(updatedProfile as any);
        localStorage.setItem("rr_profile", JSON.stringify(updatedProfile));
      }

      setActiveTrip(null);
      setBookings([]);
      
      // Also clear from global list
      const trips = JSON.parse(localStorage.getItem('rr_all_trips') || '[]');
      const updatedTrips = trips.filter((t: any) => t.trip_id !== activeTrip.trip_id);
      localStorage.setItem('rr_all_trips', JSON.stringify(updatedTrips));
      
      alert("Trip completed! Earnings have been added to your wallet.");
    } catch (error) {
      console.error("Failed to complete trip:", error);
      alert("Failed to complete trip. Please try again.");
    } finally {
      setIsCompleting(false);
    }
  };

  const pendingBookings = bookings.filter(b => b.status === BookingStatus.PENDING);
  const acceptedBookings = bookings.filter(b => b.status === BookingStatus.ACCEPTED);

  return (
    <div className="space-y-6 text-slate-900">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold">Bookings</h2>
          <p className="text-slate-500 text-sm font-medium">Review passenger requests</p>
        </div>
        {activeTrip && activeTrip.seats_booked > 0 && (
          <button 
            onClick={completeTrip}
            disabled={isCompleting}
            className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs disabled:opacity-50"
          >
            {isCompleting ? 'Processing...' : 'Complete Trip'}
          </button>
        )}
      </header>

      {/* Pending Requests */}
      <section className="space-y-4">
        <h3 className="font-bold text-sm text-slate-400 uppercase tracking-widest">Pending Requests ({pendingBookings.length})</h3>
        {pendingBookings.length > 0 ? (
          pendingBookings.map(booking => (
            <div key={booking.booking_id} className="bg-white border-2 border-slate-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <img src={booking.passenger_photo} className="w-12 h-12 rounded-full border-2 border-emerald-50" />
                <div>
                  <div className="font-bold text-slate-900">{booking.passenger_name}</div>
                  <div className="text-xs text-slate-500 font-bold flex items-center gap-1">
                    {ICONS.Star} {booking.passenger_rating} • {booking.passenger_trips} trips
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setViewingPassenger(booking)}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold"
              >
                View
              </button>
            </div>
          ))
        ) : (
          <p className="text-center text-slate-400 py-4 text-sm font-bold italic">Waiting for new bookings...</p>
        )}
      </section>

      {/* Confirmed Passengers */}
      <section className="space-y-4">
        <h3 className="font-bold text-sm text-slate-400 uppercase tracking-widest">Confirmed ({acceptedBookings.length})</h3>
        <div className="space-y-3">
          {acceptedBookings.map(booking => (
            <div key={booking.booking_id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={booking.passenger_photo} className="w-10 h-10 rounded-full grayscale opacity-70" />
                <div>
                  <div className="font-bold text-slate-700">{booking.passenger_name}</div>
                  <div className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                    {ICONS.Check} ₦{booking.amount_paid} Secured
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400">
                  <Phone size={16} />
                </button>
                <button 
                  onClick={() => {/* Mock No-Show logic */}}
                  className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold"
                >
                  No-Show
                </button>
              </div>
            </div>
          ))}
          {activeTrip && [...Array(Math.max(0, activeTrip.seats_available - acceptedBookings.length))].map((_, i) => (
            <div key={i} className="border-2 border-dashed border-slate-100 rounded-2xl p-4 flex items-center justify-center text-slate-300 text-sm font-bold">
              Empty Seat
            </div>
          ))}
        </div>
      </section>

      {/* Passenger Profile Modal */}
      {viewingPassenger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <img src={viewingPassenger.passenger_photo} className="w-24 h-24 rounded-full mx-auto border-4 border-emerald-50" />
              <div>
                <h3 className="text-xl font-bold text-slate-900">{viewingPassenger.passenger_name}</h3>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <div className="flex items-center gap-1 text-amber-500 font-bold">{ICONS.Star} {viewingPassenger.passenger_rating}</div>
                  <span className="text-slate-300">|</span>
                  <div className="text-slate-500 text-sm font-bold">{viewingPassenger.passenger_trips} trips completed</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 py-4">
                <div className="bg-emerald-50 p-3 rounded-2xl text-center">
                  <p className="text-[10px] text-emerald-600 uppercase font-bold tracking-tight">ID Verified</p>
                  <div className="text-emerald-700 font-bold flex items-center justify-center gap-1">{ICONS.Check} Yes</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-2xl text-center">
                  <p className="text-[10px] text-blue-600 uppercase font-bold tracking-tight">Payment</p>
                  <div className="text-blue-700 font-bold">₦{viewingPassenger.amount_paid}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={() => handleAction(viewingPassenger, 'accept')}
                  className="w-full bg-emerald-600 text-white p-4 rounded-2xl font-bold shadow-lg shadow-emerald-200"
                >
                  Accept Passenger
                </button>
                <button 
                  onClick={() => handleAction(viewingPassenger, 'reject')}
                  className="w-full bg-white text-red-500 p-4 rounded-2xl font-bold"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Phone: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

export default BookingManagement;
