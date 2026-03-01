
import React, { useState, useEffect } from 'react';
import { Trip } from '../types';
import { ICONS, ROUTES } from '../constants';
import { api } from '../services/api';

interface PassengerHomeProps {
  onBook: (trip: Trip, method: 'wallet' | 'paystack') => void;
}

const PassengerHome: React.FC<PassengerHomeProps> = ({ onBook }) => {
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [dateQuery, setDateQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [bookingTripId, setBookingTripId] = useState<string | null>(null);
  const [bookedTripIds, setBookedTripIds] = useState<Set<string>>(new Set());
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedTrip, setConfirmedTrip] = useState<Trip | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'paystack'>('wallet');

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoad(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const handleSearch = async () => {
    if (!originQuery && !destQuery) return;
    
    setIsSearching(true);
    setBookingError(null);
    try {
      const results = await api.searchTrips({
        origin: originQuery,
        destination: destQuery,
        date: dateQuery
      });
      setTrips(results);
      setHasSearched(true);
    } catch (err: any) {
      setBookingError(err.message || "Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  const handleReset = () => {
    setOriginQuery('');
    setDestQuery('');
    setDateQuery('');
    setTrips([]);
    setHasSearched(false);
  };

  const confirmBooking = async (trip: Trip) => {
    if (trip.seats_available <= trip.seats_booked) return;
    
    setBookingTripId(trip.trip_id);
    setSelectedTrip(null);
    setBookingError(null);
    
    try {
      await onBook(trip, paymentMethod);
      if (paymentMethod === 'wallet') {
        setBookedTripIds(prev => new Set(prev).add(trip.trip_id));
        setConfirmedTrip(trip);
      }
    } catch (error: any) {
      console.error('Booking error:', error);
      setBookingError(error.message || 'Booking failed. Please try again.');
    } finally {
      setBookingTripId(null);
    }
  };

  if (isInitialLoad) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="font-black text-slate-400 animate-pulse uppercase tracking-widest text-xs">Loading RouteRider...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-3xl font-black tracking-tight">Find a Ride</h2>
        <p className="text-gray-500 font-bold text-sm">Search for available trips across Nigeria.</p>
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
             <div className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-primary">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
             </div>
             <input 
               type="text" 
               placeholder="From (Origin)" 
               value={originQuery}
               onChange={(e) => setOriginQuery(e.target.value)}
               className="w-full pl-11 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-brand-primary rounded-2xl font-black text-sm outline-none transition-all"
             />
          </div>
          <div className="relative">
             <div className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-secondary">
               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
             </div>
             <input 
               type="text" 
               placeholder="To (Destination)" 
               value={destQuery}
               onChange={(e) => setDestQuery(e.target.value)}
               className="w-full pl-11 pr-4 py-4 bg-slate-50 border-2 border-transparent focus:border-brand-primary rounded-2xl font-black text-sm outline-none transition-all"
             />
          </div>
          <div className="relative">
             <input 
               type="date" 
               value={dateQuery}
               onChange={(e) => setDateQuery(e.target.value)}
               className="w-full px-4 py-4 bg-slate-50 border-2 border-transparent focus:border-brand-primary rounded-2xl font-black text-sm outline-none transition-all"
             />
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleSearch}
            disabled={isSearching || (!originQuery && !destQuery)}
            className="flex-1 bg-brand-primary text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2 hover:bg-brand-primary/90 active:scale-95 transition-all disabled:opacity-50"
          >
            {isSearching ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                Search Rides
              </>
            )}
          </button>
          {hasSearched && (
            <button 
              onClick={handleReset}
              className="bg-slate-100 text-brand-primary px-4 rounded-2xl font-black text-sm hover:bg-slate-200 active:scale-95 transition-all"
            >
              Reset
            </button>
          )}
        </div>
      </section>

      <section className="space-y-4">
        {hasSearched && (
          <div className="flex items-center justify-between px-1">
            <h3 className="font-black text-xs text-gray-400 uppercase tracking-widest">
              Search Results
            </h3>
            <span className="text-[10px] bg-brand-accent/10 text-brand-accent font-black px-2 py-0.5 rounded-full uppercase">
              {trips.length} Found
            </span>
          </div>
        )}
        
        {trips.length > 0 ? (
          trips.map(trip => {
            const isBooked = bookedTripIds.has(trip.trip_id);
            const isBooking = bookingTripId === trip.trip_id;
            const remaining = trip.seats_available - trip.seats_booked;

            return (
              <div 
                key={trip.trip_id} 
                onClick={() => !isBooked && remaining > 0 && setSelectedTrip(trip)}
                className={`bg-white border-2 border-slate-100 p-5 rounded-3xl shadow-sm space-y-4 animate-in fade-in slide-in-from-bottom-2 transition-all cursor-pointer hover:border-brand-accent/20 hover:shadow-md ${isBooked ? 'opacity-80' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-brand-accent/10 flex items-center justify-center text-brand-accent">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
                    </div>
                    <div>
                      <h4 className="font-black text-brand-primary leading-tight">
                        {trip.route}
                      </h4>
                      <div className="flex items-center gap-1 text-[10px] font-black text-amber-500 uppercase tracking-tighter mt-0.5">
                        {ICONS.Star} 4.9 • {trip.driver_name || 'Verified Owner'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                     <p className="text-xl font-black text-brand-secondary">₦{(trip.price_per_seat || ROUTES.SUGGESTED_PRICE_PER_SEAT).toLocaleString()}</p>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">per seat</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-y border-slate-50 py-3">
                  <div className="flex items-center gap-2">
                     <div className="text-gray-400">{ICONS.Clock}</div>
                     <p className="font-black text-sm text-black">{new Date(trip.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="text-gray-400">{ICONS.Car}</div>
                     <p className="font-black text-sm text-black">{trip.vehicle_name || trip.car_details || 'Vehicle'}</p>
                  </div>
                </div>

                {trip.pickup_landmark && (
                  <div className="flex items-start gap-2 bg-slate-50 p-3 rounded-2xl">
                    <div className="text-brand-accent mt-0.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Pickup Landmark</p>
                      <p className="text-xs font-black text-slate-700">{trip.pickup_landmark}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4">
                   <div className="flex-1 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${remaining > 0 ? 'bg-brand-accent animate-pulse' : 'bg-red-500'}`}></span>
                      <span className={`text-xs font-black ${remaining > 0 ? 'text-brand-accent' : 'text-red-700'}`}>
                        {remaining > 0 ? `${remaining} seats remaining` : 'Full'}
                      </span>
                   </div>
                   <div className={`px-4 py-2 rounded-xl font-black text-xs ${isBooked ? 'bg-brand-accent/10 text-brand-accent' : 'bg-black text-white'}`}>
                     {isBooking ? '...' : isBooked ? 'Booked ✓' : 'Book Seat'}
                   </div>
                </div>
              </div>
            );
          })
        ) : hasSearched ? (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[2rem] text-center space-y-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm text-slate-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <p className="text-sm font-black text-gray-500">
              No trips match your search criteria.
            </p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic">Try different locations or dates</p>
          </div>
        ) : (
          <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-12 rounded-[2rem] text-center space-y-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm text-slate-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <p className="text-sm font-black text-gray-500">
              Enter your route above to find available rides.
            </p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic">Trips expire after 24 hours</p>
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
                  <p className="text-brand-secondary font-black">₦{(selectedTrip.price_per_seat || ROUTES.SUGGESTED_PRICE_PER_SEAT).toLocaleString()} per seat</p>
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
                      <h4 className="font-black text-black">{selectedTrip.driver_name || 'Verified Owner'}</h4>
                      <div className="flex items-center gap-1 text-amber-500 font-black text-xs">
                        {ICONS.Star} 4.9 • Verified
                      </div>
                   </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest px-1">Payment Method</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setPaymentMethod('wallet')}
                      className={`p-4 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${paymentMethod === 'wallet' ? 'border-brand-primary bg-brand-primary/5' : 'border-slate-100 bg-white'}`}
                    >
                      <div className={paymentMethod === 'wallet' ? 'text-brand-primary' : 'text-slate-400'}>{ICONS.Wallet}</div>
                      <span className="text-[10px] font-black uppercase">Wallet</span>
                    </button>
                    <button 
                      onClick={() => setPaymentMethod('paystack')}
                      className={`p-4 rounded-3xl border-2 transition-all flex flex-col items-center gap-2 ${paymentMethod === 'paystack' ? 'border-brand-primary bg-brand-primary/5' : 'border-slate-100 bg-white'}`}
                    >
                      <div className={paymentMethod === 'paystack' ? 'text-brand-accent' : 'text-slate-400'}>{ICONS.Check}</div>
                      <span className="text-[10px] font-black uppercase">Paystack</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                   <div className="bg-slate-50 p-4 rounded-3xl space-y-1">
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Vehicle</p>
                      <p className="font-black text-sm">{selectedTrip.vehicle_name || selectedTrip.car_details || 'Vehicle'}</p>
                      <p className="text-[10px] text-brand-accent font-bold">Verified</p>
                   </div>
                   <div className="bg-slate-50 p-4 rounded-3xl space-y-1">
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Departure</p>
                      <p className="font-black text-sm">{new Date(selectedTrip.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="text-[10px] text-brand-accent font-bold">Today</p>
                   </div>
                </div>

                {selectedTrip.pickup_landmark && (
                  <div className="bg-slate-50 p-4 rounded-3xl space-y-1">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Pickup Point</p>
                    <p className="font-black text-sm">{selectedTrip.pickup_landmark}</p>
                    {selectedTrip.pickup_area && <p className="text-[10px] text-slate-500 font-bold">{selectedTrip.pickup_area}</p>}
                  </div>
                )}
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
            {/* Ticket Header */}
            <div className="bg-brand-accent p-8 text-center relative">
              <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M0 0 L100 100 M100 0 L0 100" stroke="white" strokeWidth="0.5" />
                </svg>
              </div>
              
              <div className="w-20 h-20 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white/30 shadow-lg">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-3xl font-black text-white tracking-tight">Booking Confirmed!</h3>
              <p className="text-brand-accent/10 font-bold text-sm">Show this to your driver at pickup</p>
            </div>

            {/* Ticket Body */}
            <div className="p-8 space-y-6 relative">
              {/* Perforated Line Effect */}
              <div className="absolute -top-3 left-0 w-full flex justify-between px-4">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="w-4 h-4 bg-brand-accent rounded-full -mt-2"></div>
                ))}
              </div>

              <div className="space-y-6">
                {/* Route Section */}
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Trip Route</p>
                  <div className="flex items-center gap-3">
                    <h4 className="text-xl font-black text-black">{confirmedTrip.route}</h4>
                  </div>
                </div>

                {/* Pickup Section */}
                {confirmedTrip.pickup_landmark && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Pickup Point</p>
                    <h4 className="text-sm font-black text-brand-accent">{confirmedTrip.pickup_landmark}</h4>
                  </div>
                )}

                {/* Driver & Car Details */}
                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                  <img 
                    src={`https://picsum.photos/100/100?seed=${confirmedTrip.driver_id}`} 
                    className="w-14 h-14 rounded-2xl border-2 border-white shadow-sm" 
                  />
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Your Driver</p>
                    <h4 className="font-black text-black leading-tight">{confirmedTrip.driver_name || 'Verified Owner'}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] bg-brand-accent/10 text-brand-accent font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">Verified</span>
                      <span className="text-[10px] text-amber-500 font-black flex items-center gap-0.5">{ICONS.Star} 4.9</span>
                    </div>
                  </div>
                </div>

                {/* Car & Time Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Vehicle</p>
                    <p className="font-black text-sm text-black leading-tight">{confirmedTrip.vehicle_name || confirmedTrip.car_details || 'Vehicle'}</p>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Plate Verified</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Departure</p>
                    <p className="font-black text-sm text-black">
                      {new Date(confirmedTrip.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase">Today</p>
                  </div>
                </div>

                {/* Price & ID */}
                <div className="flex items-center justify-between pt-4 border-t border-dashed border-slate-200">
                  <div>
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Amount Paid</p>
                    <p className="text-xl font-black text-brand-accent">₦{(confirmedTrip.price_per_seat || ROUTES.SUGGESTED_PRICE_PER_SEAT).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Ticket ID</p>
                    <p className="font-mono text-xs font-black text-slate-900">#{confirmedTrip.trip_id.slice(-6).toUpperCase()}</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setConfirmedTrip(null)}
                className="w-full bg-black text-white p-5 rounded-3xl font-black text-lg shadow-xl shadow-black/10 active:scale-[0.98] transition-all mt-4"
              >
                Done
              </button>
            </div>
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
