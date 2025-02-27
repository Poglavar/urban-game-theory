import type { FC } from 'react';
import { useEffect } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import type { Parcel } from '~~/types/parcel';

interface ParcelLayerProps {
    map: LeafletMap | null;
    parcels?: Parcel[];
    onParcelClick?: (parcelId: string) => void;
}

const ParcelLayer: FC<ParcelLayerProps> = ({ map, parcels = [], onParcelClick }) => {
    useEffect(() => {
        if (!map || !parcels.length) return;

        const parcelLayers = parcels.map(parcel => {
            // Parse coordinates from string (format: "lat,lng")
            const [lat, lng] = parcel.coordinates.split(',').map(Number);

            // Create a circle to represent the parcel
            const circle = L.circle([lat, lng], {
                color: parcel.isSelected ? '#ff3333' : '#3388ff',
                fillColor: parcel.isSelected ? '#ff9999' : '#99bbff',
                fillOpacity: 0.5,
                radius: Math.sqrt(parcel.area), // Simple visualization based on area
            });

            // Add click handler
            circle.on('click', () => {
                onParcelClick?.(parcel.id);
            });

            circle.addTo(map);
            return circle;
        });

        // Cleanup function to remove layers
        return () => {
            parcelLayers.forEach(layer => {
                layer.remove();
            });
        };
    }, [map, parcels, onParcelClick]);

    return null; // This is a non-visual component
};

export default ParcelLayer; 