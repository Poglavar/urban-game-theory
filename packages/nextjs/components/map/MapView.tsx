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
const MapView: FC<MapViewProps> = ({ onParcelSelect, onAnalyze }) => {
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

            const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
                (point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
            if (intersect) {
                inside = !inside;
            }
        }
        return inside;
    };

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
                                // Get roads as areas (when available)
                                way["area:highway"]
                                    (${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
                                // Get regular road ways for roads that don't have area defined
                                way["highway"]["highway"!="service"]["highway"!="footway"]["highway"!="path"]["highway"!="cycleway"]
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

                        // Separate buildings and roads
                        const buildings = data.elements.filter((el: any) => el.tags?.building && el.geometry && el.geometry.length > 0);
                        const roadAreas = data.elements.filter((el: any) => el.tags?.['area:highway'] && el.geometry && el.geometry.length > 0);
                        const roadWays = data.elements.filter((el: any) => el.tags?.highway && !el.tags?.['area:highway'] && el.geometry && el.geometry.length > 0);

                        console.log('Found buildings:', buildings.length);
                        console.log('Found road areas:', roadAreas.length);
                        console.log('Found road ways:', roadWays.length);

                        if (buildings.length < 2) {
                            throw new Error("Selected area must contain at least 2 buildings to generate parcels");
                        }

                        // First, create road polygons
                        let roadPolygons: Feature<Polygon>[] = [];

                        // Add road areas directly as polygons
                        roadAreas.forEach(road => {
                            try {
                                const coords = road.geometry.map((p: Point): [number, number] => [p.lon, p.lat]);
                                // Close the polygon if it's not closed
                                if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
                                    coords.push(coords[0]);
                                }
                                const polygon = turf.polygon([coords]);
                                roadPolygons.push(polygon);
                            } catch (error) {
                                console.warn('Error creating road area polygon:', error);
                            }
                        });

                        // For regular road ways, create buffers based on road type
                        if (roadWays.length > 0) {
                            const validRoads = roadWays.filter(road =>
                                road.geometry &&
                                road.geometry.length >= 2 && // A line needs at least 2 points
                                road.geometry.every(p => !isNaN(p.lat) && !isNaN(p.lon))
                            );

                            console.log('Valid road ways for buffering:', validRoads.length);

                            validRoads.forEach(road => {
                                try {
                                    const lineCoords = road.geometry.map((p: Point): [number, number] => [p.lon, p.lat]);
                                    const line = turf.lineString(lineCoords);

                                    // Determine buffer size based on road type (in kilometers)
                                    let bufferSize = 0.004; // Default ~4m
                                    if (road.tags.highway === 'motorway') bufferSize = 0.012; // ~12m
                                    else if (road.tags.highway === 'trunk') bufferSize = 0.010; // ~10m
                                    else if (road.tags.highway === 'primary') bufferSize = 0.008; // ~8m
                                    else if (road.tags.highway === 'secondary') bufferSize = 0.006; // ~6m

                                    const buffer = turf.buffer(line, bufferSize) as Feature<Polygon>;
                                    roadPolygons.push(buffer);
                                } catch (error) {
                                    console.warn('Error creating road buffer:', error);
                                }
                            });
                        }

                        // Combine all road polygons into a single MultiPolygon
                        let combinedRoads: Feature<Polygon | MultiPolygon> | null = null;
                        if (roadPolygons.length > 0) {
                            try {
                                // Start with the first polygon
                                combinedRoads = roadPolygons[0] as Feature<Polygon>;
                                // Combine with remaining polygons
                                for (let i = 1; i < roadPolygons.length; i++) {
                                    try {
                                        if (combinedRoads) {
                                            const union = turf.union(
                                                combinedRoads as Feature<Polygon>,
                                                roadPolygons[i] as Feature<Polygon>
                                            );
                                            if (union) {
                                                combinedRoads = union;
                                            }
                                        }
                                    } catch (error) {
                                        console.warn('Error combining road polygons:', error);
                                    }
                                }
                            } catch (error) {
                                console.warn('Error initializing combined roads:', error);
                            }
                        }

                        // Draw roads
                        if (combinedRoads) {
                            try {
                                const coordinates = combinedRoads.geometry.type === 'Polygon' ?
                                    [combinedRoads.geometry.coordinates[0]] :
                                    combinedRoads.geometry.coordinates.map(poly => poly[0]);

                                coordinates.forEach(coords => {
                                    const roadCoords: LatLngExpression[] = (coords as Position[]).map(
                                        coord => [coord[1], coord[0]]
                                    );
                                    const roadLayer = L.polygon(roadCoords, {
                                        fillColor: '#666666',
                                        color: '#666666',
                                        weight: 1,
                                        opacity: 1,
                                        fillOpacity: 0.3,
                                    }).addTo(map);
                                    Object.values(parcelLayersRef.current).forEach(layer => layer.remove());
                                    parcelLayersRef.current = {};
                                    parcelLayersRef.current['road'] = roadLayer;
                                    parcelLayersRef.current.push(roadLayer);
                                });
                            } catch (error) {
                                console.warn('Error drawing roads:', error);
                            }
                        }

                        // Extract building centers for Voronoi diagram
                        const buildingCenters: BuildingCenter[] = buildings
                            .map((building: OSMElement) => {
                                if (!building.geometry || building.geometry.length === 0) {
                                    console.log('Skipping building with invalid geometry:', building.id);
                                    return null;
                                }

                                // Check if building center is inside any road polygon
                                const center = building.geometry.reduce(
                                    (acc: Point, point: Point) => ({
                                        lat: acc.lat + point.lat / building.geometry.length,
                                        lon: acc.lon + point.lon / building.geometry.length
                                    }),
                                    { lat: 0, lon: 0 }
                                );

                                // Skip buildings that are in road areas
                                const point = turf.point([center.lon, center.lat]);
                                const isInRoad = roadPolygons.some(roadPoly => booleanPointInPolygon(point, roadPoly));
                                if (isInRoad) {
                                    console.log('Skipping building in road area:', building.id);
                                    return null;
                                }

                                return {
                                    id: building.id,
                                    center: center,
                                    geometry: building.geometry
                                };
                            })
                            .filter((b): b is BuildingCenter => b !== null);

                        console.log('Valid building centers:', buildingCenters.length);

                        if (buildingCenters.length < 2) {
                            throw new Error("Not enough valid buildings found in the selected area. Please select an area with at least 2 buildings.");
                        }

                        // Create points for Voronoi diagram
                        const points = buildingCenters.map((b: BuildingCenter): [number, number] => [b.center.lon, b.center.lat]);

                        // Check for duplicate points
                        const uniquePoints = new Set(points.map(p => `${p[0]},${p[1]}`));
                        if (uniquePoints.size < points.length) {
                            console.warn('Duplicate points detected. Filtering...');
                            const filteredPoints = Array.from(uniquePoints).map(p => {
                                const [x, y] = p.split(',').map(Number);
                                return [x, y] as [number, number];
                            });
                            if (filteredPoints.length < 2) {
                                throw new Error("Not enough unique building centers to create Voronoi diagram");
                            }
                            points.length = 0;
                            points.push(...filteredPoints);
                        }

                        console.log('Points for Voronoi:', points);

                        try {
                            const bounds = map.getBounds();
                            const boundingBox: [number, number, number, number] = [
                                bounds.getWest(),
                                bounds.getSouth(),
                                bounds.getEast(),
                                bounds.getNorth()
                            ];

                            // Validate bounding box
                            if (boundingBox.some(coord => isNaN(coord))) {
                                throw new Error("Invalid map bounds for Voronoi diagram");
                            }

                            console.log('Creating Voronoi with bounds:', boundingBox);
                            const delaunay = Delaunay.from(points);
                            const voronoi = delaunay.voronoi(boundingBox);

                            // Validate Voronoi output
                            if (!voronoi) {
                                throw new Error("Failed to create Voronoi diagram");
                            }

                            // Convert Voronoi cells to GeoJSON polygons with validation
                            const parcels: GeneratedParcel[] = buildingCenters.map((building: BuildingCenter, i: number) => {
                                try {
                                    const cell = voronoi.cellPolygon(i);
                                    if (!cell || cell.length < 4) { // A polygon needs at least 3 points plus closing point
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

                                    // Subtract combined road areas from parcel
                                    if (combinedRoads) {
                                        try {
                                            const difference = turf.difference(
                                                parcel as Feature<Polygon>,
                                                combinedRoads as Feature<Polygon>
                                            );
                                            if (difference) {
                                                if (difference.geometry.type === 'Polygon') {
                                                    parcel = difference as Feature<Polygon>;
                                                } else if (difference.geometry.type === 'MultiPolygon') {
                                                    // If we get a MultiPolygon, use the largest polygon
                                                    const polygons = difference.geometry.coordinates.map(coords => {
                                                        // Ensure we have a valid array of coordinates
                                                        const validCoords = coords[0].map(coord =>
                                                            Array.isArray(coord) ? coord : [coord[0], coord[1]]
                                                        );
                                                        return turf.polygon([validCoords]) as Feature<Polygon>;
                                                    });
                                                    const areas = polygons.map(poly => turf.area(poly));
                                                    const maxAreaIndex = areas.indexOf(Math.max(...areas));
                                                    parcel = polygons[maxAreaIndex];
                                                }
                                            }
                                        } catch (error) {
                                            console.warn('Error subtracting roads from parcel:', error);
                                        }
                                    }

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
                                        area: turf.area(parcel),
                                        tags: {}
                                    };
                                } catch (error) {
                                    console.error('Error analyzing area:', error);
                                    setError(error instanceof Error ? error.message : 'An error occurred while analyzing the area');
                                    return null;
                                }
                            }).filter((p): p is GeneratedParcel => p !== null);

                            // Draw parcels
                            parcels.forEach((parcel: GeneratedParcel) => {
                                const coordinates: LatLngExpression[] = parcel.geometry.map((point: Point) => [point.lat, point.lon]);
                                const polygon = L.polygon(coordinates, {
                                    fillColor: '#000000',
                                    color: '#000000',
                                    weight: 1,
                                    opacity: 0.5,
                                    fillOpacity: 0.1
                                }).addTo(map);

                                // Add click handler for parcels
                                polygon.on('click', () => {
                                    const buildingDetails = buildings.find(b => b.id.toString() === parcel.buildingId);
                                    if (buildingDetails) {
                                        const isSelected = polygon.options.fillColor === '#ff3388';

                                        if (isSelected) {
                                            // Deselect the parcel
                                            polygon.setStyle({ fillColor: '#000000', color: '#000000' });
                                            onParcelSelect?.(parcel.id, null);
                                        } else {
                                            // Select the parcel
                                            polygon.setStyle({ fillColor: '#ff3388', color: '#ff3388' });
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
                                                geometry: buildingDetails.geometry
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
                                        polygon.setStyle({ fillColor: '#ff3388', color: '#ff3388' });

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
                    } catch (error) {
                        console.error('Error analyzing area:', error);
                        setError(error instanceof Error ? error.message : 'An error occurred while analyzing the area');
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
    }, [onAnalyze, onParcelSelect]);

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