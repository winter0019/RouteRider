
import React, { useState, useEffect, useMemo } from 'react';
import { Trip, DriverProfile } from '../types';
import { ICONS, ROUTES, COLORS } from '../constants';

interface PassengerHomeProps {
  trips: Trip[];
  onBook: (trip: Trip) => void;
}

const PassengerHome: React.FC<PassengerHomeProps> = ({ trips, onBook }) => {
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [dateQuery, setDateQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [bookingTripId, setBookingTripId] = useState<string | null>(null);
  const [bookedTripIds, setBookedTripIds] = useState<Set<string>>(new Set());
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState({ origin: '', dest: '', date: '' });
  const [confirmedTrip, setConfirmedTrip] = useState<Trip | null>(null);

  const filteredTrips = useMemo(() => {
    return trips.filter(trip => {
      const [origin, destination] = trip.route.split('→').map(s => s.trim().toLowerCase());
      const matchesOrigin = appliedFilters.origin === '' || origin.includes(appliedFilters.origin.toLowerCase());
      const matchesDest = appliedFilters.dest === '' || destination.includes(appliedFilters.dest.toLowerCase());
      
      const tripDate = new Date(trip.departure_time).toISOString().split('T')[0];
      const matchesDate = appliedFilters.date === '' || tripDate === appliedFilters.date;
      
      return matchesOrigin && matchesDest && matchesDate;
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
    setTimeout(() => {
      setAppliedFilters({ origin: originQuery, dest: destQuery, date: dateQuery });
      setIsSearching(false);
    }, 400);
  };

  const handleReset = () => {
    setOriginQuery('');
    setDestQuery('');
    setDateQuery('');
    setAppliedFilters({ origin: '', dest: '', date: '' });
  };

  const confirmBooking = async (trip: Trip) => {
    if (trip.seats_available <= trip.seats_booked) return;
    
    setBookingTripId(trip.trip_id);
    setSelectedTrip(null);
    setBookingError(null);
    
    try {
      await onBook(trip);
      setBookedTripIds(prev => new Set(prev).add(trip.trip_id));
      setConfirmedTrip(trip);
    } catch (error) {
      setBookingError('Booking failed');
    } finally {
      setBookingTripId(null);
    }
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

      {bookingError && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-2xl text-red-600 font-bold animate-in fade-in slide-in-from-top-2">
          {bookingError}
        </div>
      )}

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
          <div className="relative">
             <input 
               type="date" 
               value={dateQuery}
               onChange={(e) => setDateQuery(e.target.value)}
               className="w-full px-4 py-4 bg-slate-50 border-2 border-transparent focus:border-emerald-500 rounded-2xl font-black text-sm outline-none transition-all"
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
          filteredTrips.map(trip => {
            const isBooked = bookedTripIds.has(trip.trip_id);
            const isBooking = bookingTripId === trip.trip_id;
            const remaining = trip.seats_available - trip.seats_booked;

            return (
              <div 
                key={trip.trip_id} 
                onClick={() => !isBooked && remaining > 0 && setSelectedTrip(trip)}
                className={`bg-white border-2 border-slate-100 p-5 rounded-3xl shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 transition-all cursor-pointer hover:border-emerald-200 hover:shadow-md ${isBooked ? 'opacity-80' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
                    </div>
                    <div>
                      <h4 className="font-black text-emerald-900 leading-tight">
                        {trip.route}
                      </h4>
                      <div className="flex items-center gap-1 text-[10px] font-black text-amber-500 uppercase tracking-tighter mt-0.5">
                        {ICONS.Star} 4.9 • {trip.driver_name || 'Verified Owner'}
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
                     <p className="font-black text-sm text-black">{trip.car_details || 'Toyota Corolla'}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                   <div className="flex-1 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${remaining > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                      <span className={`text-xs font-black ${remaining > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {remaining > 0 ? `${remaining} seats remaining` : 'Full'}
                      </span>
                   </div>
                   <div className={`px-4 py-2 rounded-xl font-black text-xs ${isBooked ? 'bg-emerald-100 text-emerald-700' : 'bg-black text-white'}`}>
                     {isBooking ? '...' : isBooked ? 'Booked ✓' : 'Book Seat'}
                   </div>
                </div>
              </div>
            );
          })
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

      {/* Trip Details Modal */}
      {selectedTrip && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-t-[3rem] p-8 space-y-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-500">
             <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-2"></div>
             
             <header className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-2xl font-black leading-tight">{selectedTrip.route}</h3>
                  <p className="text-emerald-600 font-black">₦{ROUTES.SUGGESTED_PRICE_PER_SEAT.toLocaleString()} per seat</p>
                </div>
                <button onClick={() => setSelectedTrip(null)} className="p-2 bg-slate-100 rounded-full text-slate-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
             </header>

             <section className="space-y-4">
                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-3xl">
                   <img src={`https://picsum.photos/100/100?seed=${selectedTrip.driver_id}`} className="w-14 h-14 rounded-2xl border-2 border-white shadow-sm" />
                   <div>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Car Owner</p>
                      <h4 className="font-black text-black">{selectedTrip.driver_name || 'Ahmad Bello'}</h4>
                      <div className="flex items-center gap-1 text-amber-500 font-black text-xs">
                        {ICONS.Star} 4.9 • Verified
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div className="bg-slate-50 p-4 rounded-3xl space-y-1">
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Vehicle</p>
                      <p className="font-black text-sm">{selectedTrip.car_details || 'Toyota Corolla'}</p>
                      <p className="text-[10px] text-emerald-600 font-bold">Verified</p>
                   </div>
                   <div className="bg-slate-50 p-4 rounded-3xl space-y-1">
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Departure</p>
                      <p className="font-black text-sm">{new Date(selectedTrip.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="text-[10px] text-emerald-600 font-bold">Today</p>
                   </div>
                </div>
             </section>

             <div className="pt-4">
                <button 
                  onClick={() => confirmBooking(selectedTrip)}
                  className="w-full bg-black text-white p-5 rounded-3xl font-black text-lg shadow-xl shadow-black/10 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  Confirm Booking
                </button>
                <p className="text-[10px] text-center text-gray-400 font-bold mt-4 uppercase tracking-widest">
                  Secure payment held in escrow
                </p>
             </div>
          </div>
        </div>
      )}

      {/* Booking Success Modal */}
      {confirmedTrip && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-emerald-600 p-6 animate-in fade-in zoom-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-emerald-500"></div>
            
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner border-4 border-emerald-50">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <div className="space-y-2">
              <h3 className="text-3xl font-black text-black tracking-tight">Booking Confirmed!</h3>
              <p className="text-gray-500 font-bold">You're all set for your trip.</p>
            </div>

            <div className="bg-slate-50 rounded-3xl p-5 space-y-4 text-left border-2 border-slate-100">
              <div className="flex items-center gap-4">
                <img 
                  src={`https://picsum.photos/100/100?seed=${confirmedTrip.driver_id}`} 
                  className="w-12 h-12 rounded-2xl border-2 border-white shadow-sm" 
                />
                <div>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Driver</p>
                  <h4 className="font-black text-black">{confirmedTrip.driver_name || 'Ahmad Bello'}</h4>
                  <p className="text-[10px] text-emerald-600 font-bold">Verified Owner</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/50">
                <div>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Vehicle</p>
                  <p className="font-black text-xs">{confirmedTrip.car_details || 'Toyota Corolla'}</p>
                  <p className="text-[10px] text-slate-500 font-bold">Verified</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Departure</p>
                  <p className="font-black text-xs">
                    {new Date(confirmedTrip.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold">Today</p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setConfirmedTrip(null)}
              className="w-full bg-emerald-600 text-white p-5 rounded-3xl font-black text-lg shadow-xl shadow-emerald-200 active:scale-[0.98] transition-all"
            >
              Great, thanks!
            </button>
          </div>
        </div>
      )}

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
