import React, { useEffect, useState, useCallback } from "react";
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
  // Firestore refresh (source of truth)
  // -------------------------
  const refreshTripsFromBackend = useCallback(async () => {
    try {
      const backendTrips = await api.getTrips();
      persistTrips(backendTrips);
    } catch (error) {
      console.error("Failed to refresh trips:", error);
    }
  }, []);

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

    // show cached data immediately (fast)
    if (savedTrips) setAllAvailableTrips(JSON.parse(savedTrips));
    if (savedActiveTrip) setActiveTrip(JSON.parse(savedActiveTrip));
    if (savedBookings) setBookings(JSON.parse(savedBookings));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));

    // then refresh from Firestore
    refreshTripsFromBackend();
  }, [refreshTripsFromBackend]);

  // optional: refresh when tab becomes active
  useEffect(() => {
    const onFocus = () => refreshTripsFromBackend();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshTripsFromBackend]);

  // -------------------------
  // Logout
  // -------------------------
  const handleLogout = () => {
    localStorage.removeItem("rr_profile");
    localStorage.removeItem("rr_role");
    localStorage.removeItem("rr_active_trip");
    localStorage.removeItem("rr_bookings");
    localStorage.removeItem("rr_transactions");
    // optional:
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
      const savedTrip = await api.postTrip(tripDraft);
      persistActiveTrip(savedTrip);

      // IMPORTANT: refresh so passengers see it
      await refreshTripsFromBackend();
    } catch (error) {
      console.error("Failed to post trip:", error);

      // fallback local-only (not ideal, but keeps UI alive)
      persistActiveTrip(tripDraft);
      persistTrips([tripDraft, ...allAvailableTrips]);
    }
  };

  // -------------------------
  // Passenger: Book Trip
  // -------------------------
  const handleBookTrip = async (trip: Trip) => {
    try {
      // Firestore booking: updates bookedBy
      await api.bookTrip(trip.trip_id);

      // refresh so seat counts update immediately
      await refreshTripsFromBackend();

      // local “booking record” for UI
      const mockBooking: Booking = {
        booking_id: 'b-' + Math.random().toString(36).substr(2, 5),
        trip_id: trip.trip_id,
        passenger_id: auth?.currentUser?.uid || 'guest',
        passenger_name: profile?.full_name || 'Anonymous',
        passenger_rating: 5.0,
        passenger_trips: 0,
        seats_booked: 1,
        amount_paid: ROUTES.SUGGESTED_PRICE_PER_SEAT,
        status: BookingStatus.ACCEPTED,
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

          // after login, refresh trips too
          refreshTripsFromBackend();
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
        return (
          <TripPosting
            onPost={handlePostTrip}
            activeTrip={activeTrip}
            onNavigate={setCurrentPage}
            profile={profile!}
          />
        );
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
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 relative transition-all ${
      active ? "text-emerald-700 scale-110" : "text-gray-500"
    }`}
  >
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
