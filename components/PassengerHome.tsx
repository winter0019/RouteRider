
import React, { useState, useEffect, useMemo } from 'react';
import { Trip } from '../types';
import { ICONS, ROUTES, COLORS } from '../constants';

interface PassengerHomeProps {
  trips: Trip[];
  onBook: (trip: Trip) => void;
}

const PassengerHome: React.FC<PassengerHomeProps> = ({ trips, onBook }) => {
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // We use useMemo to only re-filter when trips, originQuery, or destQuery (on button click) change
  // Actually, let's trigger search on button click for better control as requested.
  const [appliedFilters, setAppliedFilters] = useState({ origin: '', dest: '' });

  const filteredTrips = useMemo(() => {
    return trips.filter(trip => {
      const [origin, destination] = trip.route.split('→').map(s => s.trim().toLowerCase());
      const matchesOrigin = appliedFilters.origin === '' || origin.includes(appliedFilters.origin.toLowerCase());
      const matchesDest = appliedFilters.dest === '' || destination.includes(appliedFilters.dest.toLowerCase());
      return matchesOrigin && matchesDest;
    });
  }, [trips, appliedFilters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const handleSearch = () => {
    setIsSearching(true);
    // Simulate a small delay for search feel
    setTimeout(() => {
      setAppliedFilters({ origin: originQuery, dest: destQuery });
      setIsSearching(false);
    }, 400);
  };

  const handleReset = () => {
    setOriginQuery('');
    setDestQuery('');
    setAppliedFilters({ origin: '', dest: '' });
  };

  if (isInitialLoad) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-black text-gray-400 animate-pulse">Checking for available rides...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-3xl font-black tracking-tight">Find a Ride</h2>
        <p className="text-gray-500 font-bold text-sm">Real-time trips from verified car owners.</p>
      </header>

      {/* Search Section */}
      <section className="bg-white border-2 border-slate-100 p-5 rounded-[2rem] shadow-sm space-y-4">
        <div className="space-y-3">
          <div className="relative">
             <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
             </div>
             <input 
               type="text" 
               placeholder="From (Origin)" 
               value={originQuery}
               onChange={(e) => setOriginQuery(e.target.value)}
               className="w-full pl-11 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl font-black text-sm outline-none transition-all"
             />
          </div>
          <div className="relative">
             <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
             </div>
             <input 
               type="text" 
               placeholder="To (Destination)" 
               value={destQuery}
               onChange={(e) => setDestQuery(e.target.value)}
               className="w-full pl-11 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl font-black text-sm outline-none transition-all"
             />
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleSearch}
            disabled={isSearching}
            className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all"
          >
            {isSearching ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Search Rides
              </>
            )}
          </button>
          {(appliedFilters.origin !== '' || appliedFilters.dest !== '') && (
            <button 
              onClick={handleReset}
              className="bg-slate-100 text-slate-500 px-4 rounded-2xl font-black text-sm hover:bg-slate-200 active:scale-95 transition-all"
            >
              Reset
            </button>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest">
            {appliedFilters.origin || appliedFilters.dest ? 'Filtered Results' : 'Available Routes'}
          </h3>
          <span className="text-[10px] bg-emerald-100 text-emerald-700 font-black px-2 py-0.5 rounded-full uppercase">
            {filteredTrips.length} Active
          </span>
        </div>
        
        {filteredTrips.length > 0 ? (
          filteredTrips.map(trip => (
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
            <p className="text-sm font-black text-gray-500">
              {appliedFilters.origin || appliedFilters.dest 
                ? "No trips match your search criteria." 
                : "No vehicles have posted trips yet."}
            </p>
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
