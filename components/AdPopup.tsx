import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface Ad {
  id: string;
  title: string;
  subtitle: string;
  content: React.ReactNode;
  actions: {
    label: string;
    href: string;
    primary?: boolean;
    secondary?: boolean;
  }[];
}

const ads: Ad[] = [
  {
    id: 'sweet_to_taste',
    title: 'Sweet_to_taste',
    subtitle: 'Delicious & Beautiful Treats',
    content: (
      <div className="space-y-2 text-gray-600">
        <p>
          We make mouth-watering:
          <br />🎂 Cakes
          <br />🥧 Pies
          <br />🌯 Shawarma
          <br />🍔 Burgers
          <br />🍩 Doughnuts
          <br />…and more!
        </p>
        <p>
          We also cater for <strong>all kinds of gatherings</strong>.
        </p>
      </div>
    ),
    actions: [
      { label: 'View Catalog', href: '#', primary: true },
      { label: 'Instagram', href: 'https://www.instagram.com/sweet_to_taste_/', secondary: true },
    ],
  },
  {
    id: 'townlink',
    title: 'TownLink',
    subtitle: 'Turn Your Local Business Into a Customer Magnet — FREE',
    content: (
      <div className="space-y-3 text-gray-600">
        <p className="font-medium text-gray-900">
          Discover, promote, and connect with customers in your area — all in one place.
        </p>
        <ul className="space-y-1 text-sm">
          <li className="flex items-center gap-2">✅ Register in minutes</li>
          <li className="flex items-center gap-2">✅ Display all services & products</li>
          <li className="flex items-center gap-2">✅ Add all your social media links</li>
          <li className="flex items-center gap-2">✅ Reach real people in your community</li>
        </ul>
        <p className="text-xs font-bold text-emerald-600">
          No website needed. No cost. 100% FREE.
        </p>
      </div>
    ),
    actions: [
      { label: 'Register Your Business (FREE)', href: 'https://townlink.online/', primary: true },
      { label: 'Explore Local', href: 'https://townlink.online/', secondary: true },
    ],
  },
];

const AdPopup: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedAd, setSelectedAd] = useState<Ad | null>(null);

  useEffect(() => {
    // Randomly select an ad
    const randomAd = ads[Math.floor(Math.random() * ads.length)];
    setSelectedAd(randomAd);

    // Show after a short delay
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const closeAd = () => setIsVisible(false);

  if (!selectedAd) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeAd}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-8 shadow-2xl"
          >
            <button
              onClick={closeAd}
              className="absolute top-4 right-4 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={24} />
            </button>

            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900">{selectedAd.title}</h2>
              <p className="mt-1 text-sm font-medium text-gray-500 uppercase tracking-wider">
                {selectedAd.subtitle}
              </p>

              <div className="mt-6 text-left">
                {selectedAd.content}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                {selectedAd.actions.map((action, idx) => (
                  <a
                    key={idx}
                    href={action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`px-6 py-3 rounded-xl font-bold transition-all active:scale-95 text-sm ${
                      action.primary
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700 hover:-translate-y-0.5'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AdPopup;
