
import React, { useState } from 'react';
import { Trip, TripStatus } from '../types';
import { ROUTES, COLORS, ICONS } from '../constants';

interface TripPostingProps {
  onPost: (trip: Trip) => void;
  activeTrip: Trip | null;
  onNavigate: (page: any) => void;
}

const TripPosting: React.FC<TripPostingProps> = ({ onPost, activeTrip, onNavigate }) => {
  const [departureTime, setDepartureTime] = useState('07:00');
  const [seats, setSeats] = useState(3);
  const [isPosting, setIsPosting] = useState(false);

  const handlePost = () => {
    setIsPosting(true);
    // Simulate API call
    setTimeout(() => {
      const now = new Date();
      const depTime = new Date();
      const [hours, minutes] = departureTime.split(':');
      depTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const newTrip: Trip = {
        trip_id: Math.random().toString(36).substr(2, 9),
        driver_id: 'driver-123',
        route: ROUTES.DEFAULT,
        departure_time: depTime.toISOString(),
        seats_available: seats,
        seats_booked: 0,
        status: TripStatus.POSTED,
        earnings: 0,
        created_at: now.toISOString(),
      };
      
      onPost(newTrip);
      setIsPosting(false);
    }, 1200);
  };

  if (activeTrip) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center p-6 space-y-6 animate-in fade-in duration-500">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2 shadow-inner border-4 border-emerald-50">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-3xl font-black text-black tracking-tight">Trip is Live!</h2>
        <p className="text-gray-600 font-bold leading-relaxed max-w-[280px]">
          You're set for <strong>{activeTrip.route}</strong> at <strong>{new Date(activeTrip.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>.
        </p>
        <div className="w-full pt-6 space-y-4">
          <button 
            onClick={() => onNavigate('dashboard')}
            className="block w-full bg-emerald-600 text-white py-5 rounded-2xl font-black shadow-2xl shadow-emerald-200 text-lg hover:scale-[1.02] active:scale-95 transition-all"
          >
            Dashboard
          </button>
          <button 
            onClick={() => onNavigate('bookings')}
            className="block w-full bg-slate-50 text-black py-5 rounded-2xl font-black border-2 border-slate-100 hover:bg-slate-100 transition-all"
          >
            View Bookings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-black">
      <header>
        <h2 className="text-2xl font-black text-black">Post New Trip</h2>
        <p className="text-gray-600 font-bold">Fill empty seats and offset your fuel costs.</p>
      </header>

      <div className="space-y-6">
        {/* Route Selector (Hardcoded for MVP) */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Route</label>
          <div className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl flex items-center justify-between text-black font-black">
            <span className="flex items-center gap-2">
              <MapPin size={22} className="text-emerald-500" />
              {ROUTES.DEFAULT}
            </span>
            <span className="text-[10px] bg-emerald-100 px-2 py-1 rounded-md uppercase font-black text-emerald-700 tracking-tight">Active Route</span>
          </div>
        </div>

        {/* Departure Time */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Departure Time</label>
          <input 
            type="time" 
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="w-full p-5 bg-white border-2 border-slate-200 rounded-2xl text-xl font-black text-black focus:outline-none focus:ring-4 focus:ring-emerald-500/20 transition-all"
            min="05:00"
            max="22:00"
          />
          <p className="text-[10px] text-gray-500 px-1 font-bold italic">Highest demand is between 5:00 AM and 9:00 AM.</p>
        </div>

        {/* Seats Selector */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Available Seats</label>
          <div className="flex gap-3">
            {[1, 2, 3, 4].map(n => (
              <button 
                key={n}
                onClick={() => setSeats(n)}
                className={`flex-1 p-5 rounded-2xl font-black text-2xl transition-all ${
                  seats === n 
                  ? `${COLORS.primary} text-white border-transparent shadow-2xl shadow-emerald-200 scale-110` 
                  : 'bg-white border-2 text-gray-400 border-slate-100 hover:border-emerald-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between items-center mt-3 px-1">
            <span className="text-xs text-gray-600 font-bold">Potential Earnings:</span>
            <span className="text-sm font-black text-emerald-600">₦{(seats * ROUTES.PRICE_PER_SEAT).toLocaleString()}</span>
          </div>
        </div>

        <button 
          onClick={handlePost}
          disabled={isPosting}
          className={`w-full ${COLORS.primary} text-white p-5 rounded-2xl font-black text-xl shadow-2xl shadow-emerald-200 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-6`}
        >
          {isPosting ? (
            <div className="w-7 h-7 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              {ICONS.Post}
              Post Trip
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const MapPin: React.FC<{ size?: number, className?: string }> = ({ size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export default TripPosting;