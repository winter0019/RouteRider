
import React from 'react';
import { Trip } from '../types';
import { ICONS, ROUTES, COLORS } from '../constants';

interface PassengerHomeProps {
  trips: Trip[];
  onBook: (trip: Trip) => void;
}

const PassengerHome: React.FC<PassengerHomeProps> = ({ trips, onBook }) => {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-3xl font-black tracking-tight">Find a Ride</h2>
        <p className="text-gray-500 font-bold text-sm">Real-time trips from verified car owners.</p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest">Available Routes</h3>
          <span className="text-[10px] bg-emerald-100 text-emerald-700 font-black px-2 py-0.5 rounded-full uppercase">
            {trips.length} Active
          </span>
        </div>
        
        {trips.length > 0 ? (
          trips.map(trip => (
            <div key={trip.trip_id} className="bg-white border-2 border-slate-100 p-5 rounded-3xl shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
                  </div>
                  <div>
                    <h4 className="font-black text-emerald-900 leading-tight">
                      {trip.route.split('→')[0]} <span className="text-gray-300 font-medium">to</span> {trip.route.split('→')[1]}
                    </h4>
                    <div className="flex items-center gap-1 text-[10px] font-black text-amber-500 uppercase tracking-tighter mt-0.5">
                      {ICONS.Star} 4.9 • Verified Owner
                    </div>
                  </div>
                </div>
                <div className="text-right">
                   <p className="text-xl font-black text-emerald-600">₦{ROUTES.SUGGESTED_PRICE_PER_SEAT.toLocaleString()}</p>
                   <p className="text-[10px] font-bold text-gray-400">per seat</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-y border-slate-50 py-3">
                <div className="flex items-center gap-2">
                   <div className="text-gray-400">{ICONS.Clock}</div>
                   <p className="font-black text-sm text-black">{new Date(trip.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex items-center gap-2">
                   <div className="text-gray-400">{ICONS.Car}</div>
                   <p className="font-black text-sm text-black">Toyota Corolla</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                 <div className="flex-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-black text-emerald-700">{trip.seats_available - trip.seats_booked} seats remaining</span>
                 </div>
                 <button 
                  onClick={() => onBook(trip)}
                  className="bg-black text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all"
                 >
                   Book Seat
                 </button>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[2rem] text-center space-y-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm text-slate-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <p className="text-sm font-black text-gray-500">No vehicles have posted trips yet.</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic">Try changing your search</p>
          </div>
        )}
      </section>

      {/* Trust Banner */}
      <div className="bg-indigo-600 p-6 rounded-[2rem] text-white space-y-2 relative overflow-hidden">
         <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
         <h3 className="text-lg font-black leading-tight">Safety First</h3>
         <p className="text-xs text-indigo-100 font-medium leading-relaxed">NIN verification is mandatory for all drivers. Your payment is held in escrow until arrival.</p>
      </div>
    </div>
  );
};

export default PassengerHome;
