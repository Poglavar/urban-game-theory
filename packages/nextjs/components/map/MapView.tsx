'use client';

import React, { type FC, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Map as LeafletMap, LatLngExpression } from 'leaflet';
import { Delaunay } from 'd3-delaunay';
import * as turf from '@turf/turf';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type {
    Feature,
    FeatureCollection,
    Geometry,
    Position,
    Polygon,
    MultiPolygon,
    LineString
} from 'geojson';

// Constants
const INITIAL_COORDINATES = {
    lat: 45.760772,
    lng: 15.962169,
    zoom: 17
};

interface Point {
    lat: number;
    lon: number;
}

interface BuildingCenter {
    id: string;
    center: Point;
    geometry: Point[];
}

interface OSMElement {
    id: string;
    geometry: Point[];
    tags: Record<string, string>;
}

interface GeneratedParcel {
    id: string;
    buildingId: string;
    geometry: Point[];
    area: number;
    tags: Record<string, string>;
}

interface BuildingDetails {
    id: string;
    area: number;
    center: { lat: number; lon: number };
    tags: Record<string, string>;
    geometry: Array<{ lat: number; lon: number }>;
    parcelId?: string;
}

interface ParcelDetails {
    id: string;
    area: number;
    geometry: Array<{ lat: number; lon: number }>;
    tags: Record<string, string>;
    buildings: string[]; // IDs of buildings that sit on this parcel
}

interface MapViewProps {
    onParcelSelect?: (parcelId: string | null, buildingDetails: BuildingDetails | null) => void;
    onAnalyze?: () => void;
    selectedParcelIds?: string[];
    highlightedParcelIds?: string[];
    isAnalyzing?: boolean;
}

// Dynamic imports
const Map = dynamic(
    async () => {
        // Import leaflet CSS in a way that works with Next.js
        await import('leaflet/dist/leaflet.css');
        const { MapContainer } = await import('react-leaflet');
        return MapContainer;
    },
    { ssr: false }
);

// Create a client-side only version of the map component
const MapView: FC<MapViewProps> = ({ onParcelSelect, onAnalyze, selectedParcelIds = [], highlightedParcelIds = [], isAnalyzing }) => {
    const mapRef = useRef<LeafletMap | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const hasInitializedRef = useRef(false);
    const markersRef = useRef<L.Polygon[]>([]);
    const parcelLayersRef = useRef<{ [key: string]: L.Polygon }>({});
    const selectedMarkerRef = useRef<{ marker: L.Polygon; buildingId: string; details: BuildingDetails } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Helper function to check if a point is inside a polygon
    const isPointInPolygon = (point: Point, polygon: Point[]) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lon,
                yi = polygon[i].lat,
                xj = polygon[j].lon,
                yj = polygon[j].lat;

            const intersect = (
                ((yi > point.lat) !== (yj > point.lat)) &&
                (point.lon < ((xj - xi) * (point.lat - yi) / (yj - yi) + xi))
            );
            if (intersect) {
                inside = !inside;
            }
        }
        return inside;
    };

    useEffect(() => {
        // Update polygon styles based on selectedParcelIds and highlightedParcelIds
        Object.entries(parcelLayersRef.current).forEach(([parcelId, polygon]) => {
            const isSelected = selectedParcelIds.includes(parcelId);
            const isHighlighted = highlightedParcelIds.includes(parcelId);
            polygon.setStyle({
                fillColor: isHighlighted ? '#FF4500' : isSelected ? '#FFD700' : '#000000',
                color: isHighlighted ? '#FF4500' : isSelected ? '#FFD700' : '#000000',
                weight: isHighlighted ? 2 : 1,
                opacity: isHighlighted ? 0.8 : 0.5,
                fillOpacity: isHighlighted ? 0.5 : 0.3
            });
        });
    }, [selectedParcelIds, highlightedParcelIds]);

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

                // Add a handler for parcel deselection
                const handleParcelDeselect = (parcelId: string) => {
                    const layer = parcelLayersRef.current[parcelId];
                    if (layer) {
                        layer.setStyle({ fillColor: '#000000', color: '#000000' });
                    }
                };

                // Make the map instance and deselect handler available globally
                (window as any).map = map;
                (window as any).handleParcelDeselect = handleParcelDeselect;
                (window as any).analyzeArea = async () => {
                    try {
                        setError(null);
                        // Clear existing markers and selection
                        markersRef.current.forEach(marker => marker.remove());
                        Object.values(parcelLayersRef.current).forEach(layer => layer.remove());
                        markersRef.current = [];
                        parcelLayersRef.current = {};
                        selectedMarkerRef.current = null;
                        onParcelSelect?.(null, null);

                        const bounds = map.getBounds();

                        // First, fetch buildings and roads
                        const query = `
                            [out:json][timeout:25];
                            (
                                // Get buildings
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
                            throw new Error('Failed to fetch buildings and roads');
                        }

                        const data = await response.json();
                        console.log('Fetched buildings and roads:', data);

                        // Separate buildings
                        const buildings = data.elements.filter((el: any) => el.tags?.building && el.geometry && el.geometry.length > 0);

                        console.log('Found buildings:', buildings.length);

                        if (buildings.length < 2) {
                            throw new Error("Selected area must contain at least 2 buildings to generate parcels");
                        }

                        // Extract building centers for Voronoi diagram
                        const buildingCenters: BuildingCenter[] = buildings
                            .map((building: OSMElement) => {
                                if (!building.geometry || building.geometry.length === 0) {
                                    console.log('Skipping building with invalid geometry:', building.id);
                                    return null;
                                }

                                const center = building.geometry.reduce(
                                    (acc: Point, point: Point) => ({
                                        lat: acc.lat + point.lat / building.geometry.length,
                                        lon: acc.lon + point.lon / building.geometry.length
                                    }),
                                    { lat: 0, lon: 0 }
                                );

                                return {
                                    id: building.id,
                                    center: center,
                                    geometry: building.geometry
                                };
                            })
                            .filter((b): b is BuildingCenter => b !== null);

                        console.log('Valid building centers:', buildingCenters.length);

                        if (buildingCenters.length < 2) {
                            throw new Error("Not enough valid buildings to generate parcels");
                        }

                        // Create Voronoi diagram
                        const points = buildingCenters.map(b => [b.center.lon, b.center.lat] as [number, number]);
                        const delaunay = Delaunay.from(points);
                        const voronoi = delaunay.voronoi([
                            bounds.getWest(),
                            bounds.getSouth(),
                            bounds.getEast(),
                            bounds.getNorth()
                        ]);

                        // Convert Voronoi cells to GeoJSON polygons with validation
                        const parcels: GeneratedParcel[] = buildingCenters.map((building: BuildingCenter, i: number) => {
                            try {
                                const cell = voronoi.cellPolygon(i);
                                if (!cell || cell.length < 4) {
                                    console.log('Invalid cell generated for building:', building.id);
                                    return null;
                                }

                                // Validate cell coordinates
                                if (cell.some(point => point.some(coord => isNaN(coord)))) {
                                    console.log('Cell contains invalid coordinates for building:', building.id);
                                    return null;
                                }

                                // Convert cell to GeoJSON polygon
                                let parcel = turf.polygon([[
                                    ...cell.map((point: number[]): [number, number] => [point[0], point[1]]),
                                    cell[0] // Close the polygon
                                ]]);

                                // Calculate area to ensure it's a valid polygon
                                const area = turf.area(parcel);
                                if (area <= 0) {
                                    console.log('Invalid polygon area for building:', building.id);
                                    return null;
                                }

                                return {
                                    id: building.id.toString(),
                                    buildingId: building.id.toString(),
                                    geometry: parcel.geometry.coordinates[0].map((pos: Position): Point => ({
                                        lon: pos[0],
                                        lat: pos[1]
                                    })),
                                    area: area,
                                    tags: {}
                                };
                            } catch (error) {
                                console.error('Error generating parcel:', error);
                                return null;
                            }
                        }).filter((p): p is GeneratedParcel => p !== null);

                        // Draw parcels
                        parcels.forEach((parcel: GeneratedParcel) => {
                            const coordinates: LatLngExpression[] = parcel.geometry.map((point: Point) => [point.lat, point.lon]);
                            const isSelected = selectedParcelIds.includes(parcel.id);
                            const isHighlighted = highlightedParcelIds.includes(parcel.id);
                            const polygon = L.polygon(coordinates, {
                                fillColor: isHighlighted ? '#FF4500' : isSelected ? '#FFD700' : '#000000',
                                color: isHighlighted ? '#FF4500' : isSelected ? '#FFD700' : '#000000',
                                weight: isHighlighted ? 2 : 1,
                                opacity: isHighlighted ? 0.8 : 0.5,
                                fillOpacity: isHighlighted ? 0.5 : 0.3
                            }).addTo(map);

                            // Add click handler for parcels
                            polygon.on('click', () => {
                                const buildingDetails = buildings.find(b => b.id.toString() === parcel.buildingId);
                                if (buildingDetails) {
                                    const isCurrentlySelected = selectedParcelIds.includes(parcel.id);

                                    if (isCurrentlySelected) {
                                        // Deselect the parcel
                                        polygon.setStyle({ fillColor: '#000000', color: '#000000' });
                                        onParcelSelect?.(parcel.id, null);
                                    } else {
                                        // Select the parcel
                                        polygon.setStyle({ fillColor: '#FFD700', color: '#FFD700' });
                                        const details: BuildingDetails = {
                                            id: buildingDetails.id.toString(),
                                            area: parcel.area,
                                            center: buildingDetails.geometry.reduce(
                                                (acc: { lat: number; lon: number }, point: { lat: number; lon: number }) => ({
                                                    lat: acc.lat + point.lat / buildingDetails.geometry.length,
                                                    lon: acc.lon + point.lon / buildingDetails.geometry.length
                                                }),
                                                { lat: 0, lon: 0 }
                                            ),
                                            tags: buildingDetails.tags || {},
                                            geometry: buildingDetails.geometry,
                                            parcelId: parcel.id
                                        };
                                        onParcelSelect?.(parcel.id, details);
                                    }
                                }
                            });

                            parcelLayersRef.current[parcel.id] = polygon;
                        });

                        // Draw buildings
                        buildings.forEach((building: OSMElement) => {
                            if (!building.geometry || building.geometry.length === 0) return;

                            // Create polygon from the building geometry
                            const coordinates: [number, number][] = building.geometry.map((point: { lat: number; lon: number }): [number, number] => [point.lat, point.lon]);
                            const polygon = L.polygon(coordinates, {
                                fillColor: '#3388ff',
                                color: '#3388ff',
                                weight: 1,
                                opacity: 1,
                                fillOpacity: 0.5
                            }).addTo(map);

                            // Add click handler for buildings
                            polygon.on('click', () => {
                                const buildingId = building.id.toString();

                                // If this polygon is already selected, deselect it
                                if (selectedMarkerRef.current?.marker === polygon) {
                                    polygon.setStyle({ fillColor: '#3388ff', color: '#3388ff' });
                                    selectedMarkerRef.current = null;
                                    onParcelSelect?.(null, null);
                                } else {
                                    // Deselect previous polygon if exists
                                    if (selectedMarkerRef.current) {
                                        selectedMarkerRef.current.marker.setStyle({ fillColor: '#3388ff', color: '#3388ff' });
                                    }
                                    // Select new polygon
                                    polygon.setStyle({ fillColor: '#FFD700', color: '#FFD700' });

                                    const buildingDetails: BuildingDetails = {
                                        id: buildingId,
                                        area: turf.area(turf.polygon([building.geometry.map(p => [p.lon, p.lat])])),
                                        center: building.geometry.reduce(
                                            (acc: { lat: number; lon: number }, point: { lat: number; lon: number }) => ({
                                                lat: acc.lat + point.lat / building.geometry.length,
                                                lon: acc.lon + point.lon / building.geometry.length
                                            }),
                                            { lat: 0, lon: 0 }
                                        ),
                                        tags: building.tags || {},
                                        geometry: building.geometry
                                    };
                                    selectedMarkerRef.current = { marker: polygon, buildingId, details: buildingDetails };
                                    onParcelSelect?.(buildingId, buildingDetails);
                                }
                            });

                            markersRef.current.push(polygon);
                        });

                        // Call onAnalyze callback after successful fetch
                        onAnalyze?.();

                    } catch (err) {
                        console.error('Error analyzing area:', err);
                        setError(err instanceof Error ? err.message : 'An error occurred while analyzing the area');
                        return null;
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
                Object.values(parcelLayersRef.current).forEach(layer => layer.remove());
                markersRef.current = [];
                parcelLayersRef.current = {};
                selectedMarkerRef.current = null;
                mapRef.current.remove();
                mapRef.current = null;
                hasInitializedRef.current = false;
            }
        };
    }, [onAnalyze, onParcelSelect, selectedParcelIds, highlightedParcelIds]);

    return (
        <div className="relative w-full h-full">
            {error && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    <p>{error}</p>
                </div>
            )}
            <div
                ref={mapContainerRef}
                className="h-full w-full min-h-[400px]"
            />
        </div>
    );
};

// Export a dynamic component with SSR disabled and no loading state
export default dynamic(() => Promise.resolve(MapView), {
    ssr: false,
    loading: () => <div className="h-full w-full min-h-[400px] bg-base-300" />
}); 