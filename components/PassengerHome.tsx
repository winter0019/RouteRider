
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
      <header>
        <h2 className="text-3xl font-black tracking-tight">Find a Ride</h2>
        <div className="mt-2 flex items-center gap-2 p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
          <div className="p-2 bg-emerald-600 text-white rounded-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <div>
             <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none">Route</p>
             <p className="font-black text-sm">{ROUTES.DEFAULT}</p>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest px-1">Active Commutes</h3>
        
        {trips.length > 0 ? (
          trips.map(trip => (
            <div key={trip.trip_id} className="bg-white border-2 border-slate-100 p-5 rounded-3xl shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                    {ICONS.Car}
                  </div>
                  <div>
                    <h4 className="font-black text-lg">Aliyu A.</h4>
                    <div className="flex items-center gap-1 text-[10px] font-black text-amber-500 uppercase tracking-tighter">
                      {ICONS.Star} 4.9 • 120 Rides
                    </div>
                  </div>
                </div>
                <div className="text-right">
                   <p className="text-xl font-black text-emerald-600">₦{ROUTES.PRICE_PER_SEAT.toLocaleString()}</p>
                   <p className="text-[10px] font-bold text-gray-400">per seat</p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-50 pt-4">
                <div className="space-y-0.5">
                   <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Departure</p>
                   <p className="font-black text-black">{new Date(trip.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="space-y-0.5 text-right">
                   <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Vehicle</p>
                   <p className="font-black text-black">Toyota Corolla</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                 <div className="flex-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-black text-emerald-700">{trip.seats_available - trip.seats_booked} seats available</span>
                 </div>
                 <button 
                  onClick={() => onBook(trip)}
                  className="bg-black text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl hover:scale-105 active:scale-95 transition-all"
                 >
                   Book Now
                 </button>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[2rem] text-center space-y-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm text-slate-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <p className="text-sm font-black text-gray-500">No cars currently posted for this route.</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic">Check back in a few minutes</p>
          </div>
        )}
      </section>

      {/* Trust Banner */}
      <div className="bg-blue-600 p-6 rounded-[2rem] text-white space-y-2 relative overflow-hidden">
         <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
         <h3 className="text-lg font-black leading-tight">Safety First at RouteRider</h3>
         <p className="text-xs text-blue-100 font-medium leading-relaxed">All drivers on the Daura route are NIN-verified by our AI and have their vehicles inspected.</p>
      </div>
    </div>
  );
};

export default PassengerHome;
