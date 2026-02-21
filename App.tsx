import React, { useEffect, useState } from "react";
import {
  BookingStatus,
  DriverProfile,
  Trip,
  Booking,
  Transaction,
} from "./types";
import { ICONS, COLORS, ROUTES } from "./constants";

import Dashboard from "./components/Dashboard";
import TripPosting from "./components/TripPosting";
import BookingManagement from "./components/BookingManagement";
import WalletView from "./components/Wallet";
import ProfileOnboarding from "./components/ProfileOnboarding";
import SettingsView from "./components/Settings";
import PassengerHome from "./components/PassengerHome";

import { api } from "./services/api";
import { firestoreService } from "./services/firestoreService";
import { auth } from "./services/firebase";

type Page = "dashboard" | "post-trip" | "bookings" | "wallet" | "settings" | "search";
type UserRole = "driver" | "passenger";

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState<DriverProfile | null>(null);

  const [allAvailableTrips, setAllAvailableTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // -------------------------
  // Local persistence helpers
  // -------------------------
  const persistTrips = (trips: Trip[]) => {
    setAllAvailableTrips(trips);
    localStorage.setItem("rr_all_trips", JSON.stringify(trips));
  };

  const persistActiveTrip = (trip: Trip | null) => {
    setActiveTrip(trip);
    if (trip) localStorage.setItem("rr_active_trip", JSON.stringify(trip));
    else localStorage.removeItem("rr_active_trip");
  };

  const persistBookings = (newBookings: Booking[]) => {
    setBookings(newBookings);
    localStorage.setItem("rr_bookings", JSON.stringify(newBookings));
  };

  const persistTransactions = (tx: Transaction[]) => {
    setTransactions(tx);
    localStorage.setItem("rr_transactions", JSON.stringify(tx));
  };

  const handleUpdateProfile = (newProfile: DriverProfile) => {
    setProfile(newProfile);
    localStorage.setItem("rr_profile", JSON.stringify(newProfile));
  };

  // -------------------------
  // Initial load + sync
  // -------------------------
  useEffect(() => {
    const savedProfile = localStorage.getItem("rr_profile");
    const savedRole = localStorage.getItem("rr_role") as UserRole | null;
    const savedTrips = localStorage.getItem("rr_all_trips");
    const savedActiveTrip = localStorage.getItem("rr_active_trip");
    const savedBookings = localStorage.getItem("rr_bookings");
    const savedTransactions = localStorage.getItem("rr_transactions");

    if (savedProfile && savedRole) {
      setProfile(JSON.parse(savedProfile));
      setUserRole(savedRole);
      setIsLoggedIn(true);
      if (savedRole === "passenger") setCurrentPage("search");
    }

    if (savedTrips) setAllAvailableTrips(JSON.parse(savedTrips));
    if (savedActiveTrip) setActiveTrip(JSON.parse(savedActiveTrip));
    if (savedBookings) setBookings(JSON.parse(savedBookings));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));

    // ✅ Always refresh trips from Firestore (source of truth)
    const syncTrips = async () => {
      try {
        const backendTrips = await api.getTrips();
        persistTrips(backendTrips);
      } catch (error) {
        console.error("Initial trips sync failed:", error);
      }
    };

    syncTrips();
  }, []);

  // Optional: refresh trips when user comes back to app
  useEffect(() => {
    const onFocus = async () => {
      try {
        const backendTrips = await api.getTrips();
        persistTrips(backendTrips);
      } catch {}
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // -------------------------
  // Logout
  // -------------------------
  const handleLogout = () => {
    localStorage.removeItem("rr_profile");
    localStorage.removeItem("rr_role");
    localStorage.removeItem("rr_active_trip");
    localStorage.removeItem("rr_bookings");
    localStorage.removeItem("rr_transactions");
    // keep rr_all_trips (optional) or clear:
    // localStorage.removeItem("rr_all_trips");

    setIsLoggedIn(false);
    setProfile(null);
    setUserRole(null);

    persistActiveTrip(null);
    persistBookings([]);
    persistTransactions([]);

    setCurrentPage("dashboard");
  };

  // -------------------------
  // Driver: Post Trip
  // -------------------------
  const handlePostTrip = async (tripDraft: Trip) => {
    try {
      // ✅ save to Firestore
      const savedTrip = await api.postTrip(tripDraft);

      // For driver UI
      persistActiveTrip(savedTrip);

      // ✅ refresh from backend so passenger sees it immediately
      const latest = await api.getTrips();
      persistTrips(latest);
    } catch (error) {
      console.error("Failed to post trip:", error);

      // Fallback: keep local only (still show in driver UI)
      persistActiveTrip(tripDraft);
      persistTrips([tripDraft, ...allAvailableTrips]);
    }
  };

  // -------------------------
  // Passenger: Book Trip
  // -------------------------
  const handleBookTrip = async (trip: Trip) => {
    try {
      // ✅ Firestore booking updates array field bookedBy
      await api.bookTrip(trip.id);

      // ✅ refresh trips after booking so seat counts update
      const latest = await api.getTrips();
      persistTrips(latest);

      // Local “booking record” (UI only)
      const mockBooking: Booking = {
        id: Date.now(), // numeric id for UI lists
        trip_id: trip.id,
        passenger_id: auth?.currentUser?.uid || "guest",
        passenger_name: profile?.full_name || "Anonymous",
        seats: 1,
        amount_paid: Number(trip.price_per_seat ?? ROUTES.SUGGESTED_PRICE_PER_SEAT),
        status: BookingStatus.ACCEPTED, // simplified
        created_at: new Date().toISOString(),
      };

      persistBookings([mockBooking, ...bookings]);
    } catch (error) {
      console.error("Failed to book trip:", error);
      throw error;
    }
  };

  // -------------------------
  // Onboarding
  // -------------------------
  if (!isLoggedIn) {
    return (
      <ProfileOnboarding
        onComplete={async (p, role) => {
          if (auth?.currentUser) {
            try {
              await firestoreService.createUserProfile(auth.currentUser.uid, {
                ...p,
                userType: role,
              });
            } catch (error) {
              console.error("Firestore Error (createUserProfile):", error);
            }
          }

          setProfile(p);
          setUserRole(role);
          setIsLoggedIn(true);

          localStorage.setItem("rr_profile", JSON.stringify(p));
          localStorage.setItem("rr_role", role);

          if (role === "passenger") setCurrentPage("search");
        }}
      />
    );
  }

  // -------------------------
  // Page render
  // -------------------------
  const renderPage = () => {
    if (userRole === "passenger") {
      switch (currentPage) {
        case "search":
          return <PassengerHome trips={allAvailableTrips} onBook={handleBookTrip} />;
        case "wallet":
          return (
            <WalletView
              profile={profile!}
              transactions={transactions}
              userRole={userRole}
              bookings={bookings}
            />
          );
        case "settings":
          return (
            <SettingsView
              profile={profile!}
              onLogout={handleLogout}
              onUpdate={handleUpdateProfile}
              userRole={userRole}
            />
          );
        default:
          return <PassengerHome trips={allAvailableTrips} onBook={handleBookTrip} />;
      }
    }

    // driver
    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard
            profile={profile!}
            activeTrip={activeTrip}
            bookings={bookings}
            onNavigate={setCurrentPage}
          />
        );
      case "post-trip":
        return <TripPosting onPost={handlePostTrip} activeTrip={activeTrip} onNavigate={setCurrentPage} />;
      case "bookings":
        return (
          <BookingManagement
            bookings={bookings}
            setBookings={persistBookings}
            activeTrip={activeTrip}
            setActiveTrip={persistActiveTrip}
            setTransactions={setTransactions}
            setProfile={setProfile}
          />
        );
      case "wallet":
        return <WalletView profile={profile!} transactions={transactions} userRole={userRole} bookings={bookings} />;
      case "settings":
        return <SettingsView profile={profile!} onLogout={handleLogout} onUpdate={handleUpdateProfile} userRole={userRole} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-white shadow-xl relative overflow-hidden text-black font-bold">
      <header className="px-4 py-4 flex items-center justify-between border-b sticky top-0 bg-white z-10">
        <button
          onClick={() => setCurrentPage(userRole === "passenger" ? "search" : "dashboard")}
          className="flex items-center gap-2"
        >
          <div className={`w-8 h-8 ${COLORS.primary} rounded-full flex items-center justify-center text-white font-black`}>
            R
          </div>
          <h1 className="font-black text-xl">RouteRider</h1>
        </button>

        <div className="flex items-center gap-3">
          <div className="text-[10px] font-black uppercase text-gray-400 bg-slate-100 px-2 py-1 rounded-md">
            {userRole}
          </div>

          <button
            onClick={() => setCurrentPage("settings")}
            className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border-2 border-emerald-50 shadow-sm"
          >
            <img
              src={profile?.profile_photo_url || `https://picsum.photos/100/100?seed=${profile?.user_id}`}
              alt="Me"
              className="w-full h-full object-cover"
            />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 p-4">{renderPage()}</main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t px-6 py-3 flex justify-between items-center z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
        {userRole === "driver" ? (
          <>
            <NavItem active={currentPage === "dashboard"} onClick={() => setCurrentPage("dashboard")} icon={ICONS.Dashboard} label="Home" />
            <NavItem active={currentPage === "post-trip"} onClick={() => setCurrentPage("post-trip")} icon={ICONS.Post} label="Post" />
            <NavItem
              active={currentPage === "bookings"}
              onClick={() => setCurrentPage("bookings")}
              icon={ICONS.Notification}
              label="Bookings"
              badge={bookings.filter((b) => b.status === BookingStatus.PENDING).length}
            />
            <NavItem active={currentPage === "wallet"} onClick={() => setCurrentPage("wallet")} icon={ICONS.Wallet} label="Wallet" />
          </>
        ) : (
          <>
            <NavItem active={currentPage === "search"} onClick={() => setCurrentPage("search")} icon={ICONS.Car} label="Find Rides" />
            <NavItem active={currentPage === "wallet"} onClick={() => setCurrentPage("wallet")} icon={ICONS.Wallet} label="My Trips" />
            <NavItem active={currentPage === "settings"} onClick={() => setCurrentPage("settings")} icon={ICONS.User} label="Profile" />
          </>
        )}
      </nav>
    </div>
  );
};

const NavItem: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}> = ({ active, onClick, icon, label, badge }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 relative transition-all ${active ? "text-emerald-700 scale-110" : "text-gray-500"}`}>
    <div className="relative">
      {icon}
      {badge && badge > 0 ? (
        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black">
          {badge}
        </span>
      ) : null}
    </div>
    <span className="text-[10px] font-black">{label}</span>
  </button>
);

export default App;

import React, { useState, useEffect } from 'react';
import { 
  TripStatus, 
  BookingStatus, 
  DriverProfile, 
  Trip, 
  Booking, 
  Transaction 
} from './types';
import { ROUTES, ICONS, COLORS } from './constants';
import Dashboard from './components/Dashboard';
import TripPosting from './components/TripPosting';
import BookingManagement from './components/BookingManagement';
import WalletView from './components/Wallet';
import ProfileOnboarding from './components/ProfileOnboarding';
import SettingsView from './components/Settings';
import PassengerHome from './components/PassengerHome';
import { api } from './services/api';
import { firestoreService } from './services/firestoreService';
import { auth } from './services/firebase';

type Page = 'dashboard' | 'post-trip' | 'bookings' | 'wallet' | 'settings' | 'search';
type UserRole = 'driver' | 'passenger';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  
  const [allAvailableTrips, setAllAvailableTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const savedProfile = localStorage.getItem('rr_profile');
    const savedRole = localStorage.getItem('rr_role') as UserRole;
    const savedTrips = localStorage.getItem('rr_all_trips');
    const savedActiveTrip = localStorage.getItem('rr_active_trip');
    const savedBookings = localStorage.getItem('rr_bookings');
    const savedTransactions = localStorage.getItem('rr_transactions');

    if (savedProfile && savedRole) {
      setProfile(JSON.parse(savedProfile));
      setUserRole(savedRole);
      setIsLoggedIn(true);
      if (savedRole === 'passenger') setCurrentPage('search');
    }

    if (savedTrips) setAllAvailableTrips(JSON.parse(savedTrips));
    if (savedActiveTrip) setActiveTrip(JSON.parse(savedActiveTrip));
    if (savedBookings) setBookings(JSON.parse(savedBookings));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));

    // Sync with backend
    const syncData = async () => {
      try {
        const backendTrips = await api.getTrips().catch(() => []);
        if (backendTrips.length > 0) persistTrips(backendTrips);
      } catch (error) {
        console.error('Initial sync failed:', error);
      }
    };
    syncData();
  }, []);

  const persistTrips = (trips: Trip[]) => {
    setAllAvailableTrips(trips);
    localStorage.setItem('rr_all_trips', JSON.stringify(trips));
  };

  const persistActiveTrip = (trip: Trip | null) => {
    setActiveTrip(trip);
    if (trip) localStorage.setItem('rr_active_trip', JSON.stringify(trip));
    else localStorage.removeItem('rr_active_trip');
  };

  const persistBookings = (newBookings: Booking[]) => {
    setBookings(newBookings);
    localStorage.setItem('rr_bookings', JSON.stringify(newBookings));
  };

  const handleUpdateProfile = (newProfile: DriverProfile) => {
    setProfile(newProfile);
    localStorage.setItem('rr_profile', JSON.stringify(newProfile));
  };

  const handleLogout = () => {
    localStorage.removeItem('rr_profile');
    localStorage.removeItem('rr_role');
    setIsLoggedIn(false);
    setProfile(null);
    setUserRole(null);
    persistActiveTrip(null);
    persistBookings([]);
    setTransactions([]);
    setCurrentPage('dashboard');
  };

  const handlePostTrip = async (trip: Trip) => {
    try {
      const savedTrip = await api.postTrip(trip);
      persistActiveTrip(savedTrip);
      const updatedTrips = [savedTrip, ...allAvailableTrips];
      persistTrips(updatedTrips);
    } catch (error) {
      console.error('Failed to post trip to backend:', error);
      // Fallback to local
      persistActiveTrip(trip);
      const updatedTrips = [trip, ...allAvailableTrips];
      persistTrips(updatedTrips);
    }
  };

  const handleBookTrip = async (trip: Trip) => {
    try {
      await api.bookTrip(trip.trip_id);
      
      const updatedTrips = allAvailableTrips.map(t => 
        t.trip_id === trip.trip_id ? { ...t, seats_booked: t.seats_booked + 1, bookedBy: [...(t.bookedBy || []), auth?.currentUser?.uid || ''] } : t
      );
      persistTrips(updatedTrips);

      if (activeTrip && activeTrip.trip_id === trip.trip_id) {
        persistActiveTrip({ ...activeTrip, seats_booked: activeTrip.seats_booked + 1, bookedBy: [...(activeTrip.bookedBy || []), auth?.currentUser?.uid || ''] });
      }

      // Since we don't have a separate bookings collection in the provided rules,
      // we'll just update the local state to reflect the booking.
      const mockBooking: Booking = {
        booking_id: 'b-' + Math.random().toString(36).substr(2, 5),
        trip_id: trip.trip_id,
        passenger_id: auth?.currentUser?.uid || 'guest',
        passenger_name: profile?.full_name || 'Anonymous',
        passenger_rating: 5.0,
        passenger_trips: 0,
        seats_booked: 1,
        amount_paid: ROUTES.SUGGESTED_PRICE_PER_SEAT,
        status: BookingStatus.ACCEPTED, // Auto-accepted in this simplified model
        created_at: new Date().toISOString(),
      };
      persistBookings([mockBooking, ...bookings]);
    } catch (error) {
      console.error('Failed to book trip on Firestore:', error);
      throw error;
    }
  };

  if (!isLoggedIn) {
    return (
      <ProfileOnboarding 
        onComplete={async (p, role) => {
          if (auth?.currentUser) {
            try {
              await firestoreService.createUserProfile(auth.currentUser.uid, {
                ...p,
                userType: role
              });
            } catch (error) {
              console.error('Firestore Error (createUserProfile):', error);
            }
          }
          setProfile(p);
          setUserRole(role);
          setIsLoggedIn(true);
          localStorage.setItem('rr_profile', JSON.stringify(p));
          localStorage.setItem('rr_role', role);
          if (role === 'passenger') setCurrentPage('search');
        }} 
      />
    );
  }

  const renderPage = () => {
    if (userRole === 'passenger') {
      switch (currentPage) {
        case 'search':
          return <PassengerHome trips={allAvailableTrips} onBook={handleBookTrip} />;
        case 'wallet':
          return <WalletView profile={profile!} transactions={transactions} userRole={userRole} bookings={bookings} />;
        case 'settings':
          return <SettingsView profile={profile!} onLogout={handleLogout} onUpdate={handleUpdateProfile} userRole={userRole} />;
        default:
          return <PassengerHome trips={allAvailableTrips} onBook={handleBookTrip} />;
      }
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard profile={profile!} activeTrip={activeTrip} bookings={bookings} onNavigate={setCurrentPage} />;
      case 'post-trip':
        return <TripPosting onPost={handlePostTrip} activeTrip={activeTrip} onNavigate={setCurrentPage} />;
      case 'bookings':
        return <BookingManagement 
          bookings={bookings} 
          setBookings={persistBookings} 
          activeTrip={activeTrip} 
          setActiveTrip={persistActiveTrip} 
          setTransactions={setTransactions} 
          setProfile={setProfile} 
        />;
      case 'wallet':
        return <WalletView profile={profile!} transactions={transactions} userRole={userRole!} bookings={bookings} />;
      case 'settings':
        return <SettingsView profile={profile!} onLogout={handleLogout} onUpdate={handleUpdateProfile} userRole={userRole!} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-white shadow-xl relative overflow-hidden text-black font-bold">
      <header className="px-4 py-4 flex items-center justify-between border-b sticky top-0 bg-white z-10">
        <button onClick={() => setCurrentPage(userRole === 'passenger' ? 'search' : 'dashboard')} className="flex items-center gap-2">
          <div className={`w-8 h-8 ${COLORS.primary} rounded-full flex items-center justify-center text-white font-black`}>R</div>
          <h1 className="font-black text-xl">RouteRider</h1>
        </button>
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-black uppercase text-gray-400 bg-slate-100 px-2 py-1 rounded-md">{userRole}</div>
          <button onClick={() => setCurrentPage('settings')} className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border-2 border-emerald-50 shadow-sm">
            <img src={profile?.profile_photo_url || `https://picsum.photos/100/100?seed=${profile?.user_id}`} alt="Me" className="w-full h-full object-cover" />
          </button>
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto pb-24 p-4">{renderPage()}</main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t px-6 py-3 flex justify-between items-center z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
        {userRole === 'driver' ? (
          <>
            <NavItem active={currentPage === 'dashboard'} onClick={() => setCurrentPage('dashboard')} icon={ICONS.Dashboard} label="Home" />
            <NavItem active={currentPage === 'post-trip'} onClick={() => setCurrentPage('post-trip')} icon={ICONS.Post} label="Post" />
            <NavItem active={currentPage === 'bookings'} onClick={() => setCurrentPage('bookings')} icon={ICONS.Notification} label="Bookings" badge={bookings.filter(b => b.status === BookingStatus.PENDING).length} />
            <NavItem active={currentPage === 'wallet'} onClick={() => setCurrentPage('wallet')} icon={ICONS.Wallet} label="Wallet" />
          </>
        ) : (
          <>
            <NavItem active={currentPage === 'search'} onClick={() => setCurrentPage('search')} icon={ICONS.Car} label="Find Rides" />
            <NavItem active={currentPage === 'wallet'} onClick={() => setCurrentPage('wallet')} icon={ICONS.Wallet} label="My Trips" />
            <NavItem active={currentPage === 'settings'} onClick={() => setCurrentPage('settings')} icon={ICONS.User} label="Profile" />
          </>
        )}
      </nav>
    </div>
  );
};

const NavItem: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string, badge?: number }> = ({ active, onClick, icon, label, badge }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 relative transition-all ${active ? 'text-emerald-700 scale-110' : 'text-gray-500'}`}>
    <div className="relative">
      {icon}
      {badge && badge > 0 ? <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black">{badge}</span> : null}
    </div>
    <span className="text-[10px] font-black">{label}</span>
  </button>
);

export default App;
