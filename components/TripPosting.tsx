
import React, { useState } from 'react';
import { Trip, TripStatus, DriverProfile } from '../types';
import { ROUTES, COLORS, ICONS } from '../constants';

interface TripPostingProps {
  onPost: (trip: Trip) => void;
  activeTrip: Trip | null;
  onNavigate: (page: any) => void;
  profile: DriverProfile;
}

const TripPosting: React.FC<TripPostingProps> = ({ onPost, activeTrip, onNavigate, profile }) => {
  const [origin, setOrigin] = useState('Katsina');
  const [destination, setDestination] = useState('Kano');
  const [departureTime, setDepartureTime] = useState('07:00');
  const [seats, setSeats] = useState(3);
  const [isPosting, setIsPosting] = useState(false);

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const handlePost = () => {
    if (!origin || !destination) return alert("Please enter both origin and destination");
    setIsPosting(true);
    
    setTimeout(() => {
      const now = new Date();
      const depTime = new Date();
      const [hours, minutes] = departureTime.split(':');
      depTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const newTrip: Trip = {
        trip_id: Math.random().toString(36).substr(2, 9),
        driver_id: profile.user_id,
        driver_name: profile.full_name,
        car_details: `${profile.car_make} ${profile.car_model} (${profile.plate_number})`,
        origin: origin,
        destination: destination,
        route: `${origin} → ${destination}`,
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
        <p className="text-gray-600 font-bold">Where are you heading today?</p>
      </header>

      <div className="space-y-6">
        {/* Route Inputs */}
        <div className="space-y-3 relative">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Starting From</label>
            <div className="flex items-center gap-3 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl">
              <div className="text-emerald-500"><MapPin size={20} /></div>
              <input 
                placeholder="Origin (e.g. Daura)"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="bg-transparent w-full font-black text-black outline-none placeholder:text-gray-300"
              />
            </div>
          </div>

          <button 
            onClick={handleSwap}
            className="absolute right-4 top-1/2 -translate-y-1/2 mt-1 z-10 w-10 h-10 bg-white border-2 border-slate-100 rounded-full flex items-center justify-center text-emerald-600 shadow-sm active:rotate-180 transition-transform duration-300"
          >
            {ICONS.Swap}
          </button>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Destination</label>
            <div className="flex items-center gap-3 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl">
              <div className="text-emerald-500"><MapPin size={20} /></div>
              <input 
                placeholder="Where to? (e.g. Kano)"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="bg-transparent w-full font-black text-black outline-none placeholder:text-gray-300"
              />
            </div>
          </div>
        </div>

        {/* Departure Time */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Departure Time</label>
          <input 
            type="time" 
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="w-full p-5 bg-white border-2 border-slate-200 rounded-2xl text-xl font-black text-black focus:outline-none focus:ring-4 focus:ring-emerald-500/20 transition-all"
          />
        </div>

        {/* Seats Selector */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Available Seats</label>
          <div className="flex gap-3">
            {[1, 2, 3, 4].map(n => (
              <button 
                key={n}
                onClick={() => setSeats(n)}
                className={`flex-1 p-5 rounded-2xl font-black text-2xl transition-all ${
                  seats === n 
                  ? `${COLORS.primary} text-white border-transparent shadow-2xl shadow-emerald-200 scale-105` 
                  : 'bg-white border-2 text-gray-400 border-slate-100'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={handlePost}
          disabled={isPosting || !origin || !destination}
          className={`w-full ${COLORS.primary} text-white p-5 rounded-2xl font-black text-xl shadow-2xl shadow-emerald-200 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-6 disabled:opacity-50`}
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
