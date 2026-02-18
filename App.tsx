
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

type Page = 'dashboard' | 'post-trip' | 'bookings' | 'wallet' | 'settings' | 'search';
type UserRole = 'driver' | 'passenger';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  
  // Persisted trips state for the local demo
  const [allAvailableTrips, setAllAvailableTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Load initial data from localStorage
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
  }, []);

  // Persistence helpers
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
    // Note: We don't remove rr_all_trips here because they are global to the platform
    setIsLoggedIn(false);
    setProfile(null);
    setUserRole(null);
    persistActiveTrip(null);
    persistBookings([]);
    setTransactions([]);
    setCurrentPage('dashboard');
  };

  if (!isLoggedIn) {
    return (
      <ProfileOnboarding 
        onComplete={(p, role) => {
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

  const handlePostTrip = (trip: Trip) => {
    persistActiveTrip(trip);
    const updatedTrips = [trip, ...allAvailableTrips];
    persistTrips(updatedTrips);
  };

  const renderPage = () => {
    if (userRole === 'passenger') {
      switch (currentPage) {
        case 'search':
          return <PassengerHome trips={allAvailableTrips} onBook={(trip) => {
            alert(`Booking requested for ${trip.route}! (Demo: Driver will see this in their Bookings tab)`);
          }} />;
        case 'wallet':
          return <WalletView profile={profile!} transactions={transactions} userRole={userRole} />;
        case 'settings':
          return <SettingsView profile={profile!} onLogout={handleLogout} onUpdate={handleUpdateProfile} userRole={userRole} />;
        default:
          return <PassengerHome trips={allAvailableTrips} onBook={() => {}} />;
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
        return <WalletView profile={profile!} transactions={transactions} userRole={userRole!} />;
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
