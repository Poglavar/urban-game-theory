'use client';

import React, { type FC, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { Map as LeafletMap, CircleMarker } from 'leaflet';

// Constants
const INITIAL_COORDINATES = {
    lat: 45.760772,
    lng: 15.962169,
    zoom: 17
};

interface MapViewProps {
    onParcelSelect?: (parcelId: string) => void;
    onAnalyze?: () => void;
}

// Create a client-side only version of the map component
const MapView: FC<MapViewProps> = ({ onParcelSelect, onAnalyze }) => {
    const mapRef = useRef<LeafletMap | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const hasInitializedRef = useRef(false);
    const markersRef = useRef<CircleMarker[]>([]);

    useEffect(() => {
        if (!mapContainerRef.current || hasInitializedRef.current || typeof window === 'undefined') return;

        hasInitializedRef.current = true;

        // Dynamically import Leaflet only on the client side
        const initializeMap = async () => {
            try {
                const L = (await import('leaflet')).default;
                await import('leaflet/dist/leaflet.css');

                // Initialize map
                const map = L.map(mapContainerRef.current!).setView(
                    [INITIAL_COORDINATES.lat, INITIAL_COORDINATES.lng],
                    INITIAL_COORDINATES.zoom
                );

                // Add OpenStreetMap tiles
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(map);

                mapRef.current = map;

                // Make the map instance available globally for the analyze function
                (window as any).map = map;
                (window as any).analyzeArea = async () => {
                    try {
                        // Clear existing markers
                        markersRef.current.forEach(marker => marker.remove());
                        markersRef.current = [];

                        const bounds = map.getBounds();
                        const query = `
                            [out:json][timeout:25];
                            (
                                way["building"]
                                    (${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
                            );
                            out body geom;
                        `;

                        const response = await fetch('https://overpass-api.de/api/interpreter', {
                            method: 'POST',
                            body: query,
                        });

                        if (!response.ok) {
                            throw new Error('Failed to fetch buildings');
                        }

                        const data = await response.json();
                        console.log('Fetched buildings:', data);

                        // Process each building
                        data.elements.forEach((building: any, index: number) => {
                            if (!building.geometry || building.geometry.length === 0) return;

                            // Calculate center point of the building
                            const center = building.geometry.reduce(
                                (acc: { lat: number; lon: number }, point: { lat: number; lon: number }) => ({
                                    lat: acc.lat + point.lat / building.geometry.length,
                                    lon: acc.lon + point.lon / building.geometry.length
                                }),
                                { lat: 0, lon: 0 }
                            );

                            // Calculate approximate area
                            const area = building.geometry.reduce((acc: number, point: any, i: number) => {
                                const next = building.geometry[(i + 1) % building.geometry.length];
                                return acc + (point.lon * next.lat - next.lon * point.lat);
                            }, 0) / 2;

                            const absArea = Math.abs(area) * 1000000; // Convert to square meters
                            const radius = Math.sqrt(absArea / Math.PI); // Calculate radius for circle of equivalent area

                            // Create circle marker
                            const marker = L.circleMarker([center.lat, center.lon], {
                                radius: Math.max(5, Math.min(20, radius / 5)), // Scale radius, but keep it between 5 and 20 pixels
                                fillColor: '#3388ff',
                                color: '#3388ff',
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.5
                            }).addTo(map);

                            // Add click handler
                            marker.on('click', () => {
                                // Highlight selected building
                                markersRef.current.forEach(m => m.setStyle({ fillColor: '#3388ff', color: '#3388ff' }));
                                marker.setStyle({ fillColor: '#ff3388', color: '#ff3388' });
                                onParcelSelect?.(building.id.toString());
                            });

                            markersRef.current.push(marker);
                        });

                        // Call onAnalyze callback after successful fetch
                        onAnalyze?.();

                    } catch (error) {
                        console.error('Error analyzing area:', error);
                        onAnalyze?.(); // Still call onAnalyze to reset the button state
                    }
                };
            } catch (error) {
                console.error('Error initializing map:', error);
                hasInitializedRef.current = false;
            }
        };

        initializeMap();

        return () => {
            if (mapRef.current) {
                // Clear markers before removing map
                markersRef.current.forEach(marker => marker.remove());
                markersRef.current = [];

                mapRef.current.remove();
                mapRef.current = null;
                hasInitializedRef.current = false;
            }
        };
    }, [onAnalyze, onParcelSelect]);

    return (
        <div
            ref={mapContainerRef}
            className="h-full w-full min-h-[400px]"
        />
    );
};

// Export a dynamic component with SSR disabled and no loading state
export default dynamic(() => Promise.resolve(MapView), {
    ssr: false,
    loading: () => <div className="h-full w-full min-h-[400px] bg-base-300" />
}); 