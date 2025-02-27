import { ReactNode } from 'react';

interface LayoutProps {
    mapComponent: ReactNode;
    controlsComponent: ReactNode;
    listComponent: ReactNode;
    detailsComponent: ReactNode;
}

const Layout = ({
    mapComponent,
    controlsComponent,
    listComponent,
    detailsComponent,
}: LayoutProps) => {
    return (
        <div className="h-screen w-screen flex flex-wrap">
            {/* Upper Left - Map */}
            <div className="w-1/2 h-1/2 border-r border-b border-gray-300">
                {mapComponent}
            </div>

            {/* Upper Right - Controls */}
            <div className="w-1/2 h-1/2 border-b border-gray-300 p-4">
                {controlsComponent}
            </div>

            {/* Lower Left - List */}
            <div className="w-1/2 h-1/2 border-r border-gray-300 p-4 overflow-auto">
                {listComponent}
            </div>

            {/* Lower Right - Details */}
            <div className="w-1/2 h-1/2 p-4 overflow-auto">
                {detailsComponent}
            </div>
        </div>
    );
};

export default Layout; 