import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default icon (leaflet's default uses bundler-broken paths)
const icon = L.icon({
  iconUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Props {
  lat?: number;
  lng?: number;
  address?: string;
  onChange: (lat: number, lng: number, address?: string) => void;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

// Default Jakarta if no coords yet
const DEFAULT_LAT = -6.2088;
const DEFAULT_LNG = 106.8456;

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export function LocationPicker({ lat, lng, address, onChange }: Props) {
  const [pos, setPos] = useState<[number, number]>([
    lat ?? DEFAULT_LAT,
    lng ?? DEFAULT_LNG,
  ]);
  const [search, setSearch] = useState(address ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Sync incoming props (when tenant changes)
  useEffect(() => {
    if (typeof lat === "number" && typeof lng === "number") {
      setPos([lat, lng]);
    }
  }, [lat, lng]);

  function pick(newLat: number, newLng: number, newAddress?: string) {
    setPos([newLat, newLng]);
    onChange(newLat, newLng, newAddress);
  }

  // Address search via Nominatim (OpenStreetMap, free, no key)
  function doSearch(q: string) {
    setSearch(q);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&q=${encodeURIComponent(q)}`,
          { headers: { Accept: "application/json" } }
        );
        const data: SearchResult[] = await res.json();
        setResults(data);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  // Reverse geocode: lat/lng → address
  async function reverseGeocode(la: number, lo: number) {
    setReverseLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${lo}`,
        { headers: { Accept: "application/json" } }
      );
      const data = await res.json();
      return data?.display_name as string | undefined;
    } catch {
      return undefined;
    } finally {
      setReverseLoading(false);
    }
  }

  // Geolocation: use device GPS
  function useMyLocation() {
    if (!navigator.geolocation) {
      alert("Browser tidak mendukung geolocation.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const la = p.coords.latitude;
        const lo = p.coords.longitude;
        const addr = await reverseGeocode(la, lo);
        pick(la, lo, addr);
        if (addr) setSearch(addr);
      },
      (err) => alert("Gagal ambil lokasi: " + err.message),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function onMapClick(la: number, lo: number) {
    const addr = await reverseGeocode(la, lo);
    pick(la, lo, addr);
    if (addr) setSearch(addr);
  }

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <input
          className="input pr-24"
          placeholder="🔎 Cari alamat: jalan, kota, landmark…"
          value={search}
          onChange={(e) => doSearch(e.target.value)}
          onFocus={() => results.length && setShowResults(true)}
          onBlur={() => window.setTimeout(() => setShowResults(false), 200)}
        />
        <button
          type="button"
          onClick={useMyLocation}
          className="absolute right-1 top-1/2 -translate-y-1/2 text-xs px-2.5 py-1.5 rounded-md bg-brand-50 text-brand-700 hover:bg-brand-100 font-medium"
          title="Gunakan lokasi saya (GPS)"
        >
          📍 GPS
        </button>

        {/* Search dropdown */}
        {showResults && (results.length > 0 || searching) && (
          <div className="absolute z-[1000] left-0 right-0 mt-1 bg-white border border-surface-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {searching && (
              <div className="px-3 py-2 text-xs text-ink-500">Mencari…</div>
            )}
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const la = parseFloat(r.lat);
                  const lo = parseFloat(r.lon);
                  pick(la, lo, r.display_name);
                  setSearch(r.display_name);
                  setShowResults(false);
                }}
                className="block w-full text-left px-3 py-2 text-xs hover:bg-surface-50 border-b border-surface-100 last:border-b-0"
              >
                <div className="text-ink-700 line-clamp-2">{r.display_name}</div>
                <div className="text-ink-400 text-[10px] font-mono mt-0.5">
                  {parseFloat(r.lat).toFixed(5)}, {parseFloat(r.lon).toFixed(5)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-surface-200" style={{ height: 340 }}>
        <MapContainer
          center={pos}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Recenter lat={pos[0]} lng={pos[1]} />
          <ClickHandler onPick={onMapClick} />
          <Marker
            position={pos}
            icon={icon}
            draggable={true}
            eventHandlers={{
              dragend: async (e) => {
                const m = e.target as L.Marker;
                const ll = m.getLatLng();
                const addr = await reverseGeocode(ll.lat, ll.lng);
                pick(ll.lat, ll.lng, addr);
                if (addr) setSearch(addr);
              },
            }}
          />
        </MapContainer>
      </div>

      {/* Coords readout + manual */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="text-ink-500">📌 Titik:</div>
        <input
          type="number"
          step="0.000001"
          className="input flex-1 min-w-[120px] font-mono text-xs h-8"
          value={pos[0]}
          onChange={(e) => {
            const la = parseFloat(e.target.value);
            if (!isNaN(la)) pick(la, pos[1]);
          }}
          placeholder="Latitude"
        />
        <input
          type="number"
          step="0.000001"
          className="input flex-1 min-w-[120px] font-mono text-xs h-8"
          value={pos[1]}
          onChange={(e) => {
            const lo = parseFloat(e.target.value);
            if (!isNaN(lo)) pick(pos[0], lo);
          }}
          placeholder="Longitude"
        />
        <a
          href={`https://www.google.com/maps?q=${pos[0]},${pos[1]}`}
          target="_blank"
          rel="noreferrer"
          className="text-brand-600 hover:underline whitespace-nowrap"
        >
          🗺 Buka Google Maps ↗
        </a>
        {reverseLoading && <span className="text-ink-400">menerjemahkan alamat…</span>}
      </div>

      <p className="text-[11px] text-ink-500">
        💡 Klik di peta atau drag pin untuk pindahkan titik. Tombol <strong>GPS</strong> pakai lokasi device.
        Search alamat & reverse-geocode powered by OpenStreetMap (gratis, tanpa API key).
      </p>
    </div>
  );
}
