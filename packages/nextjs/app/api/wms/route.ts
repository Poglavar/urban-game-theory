import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const wmsParams = searchParams.toString();
        
        console.log('WMS Proxy - Incoming request params:', wmsParams);
        
        const wmsUrl = `https://geoportal.zagreb.hr/services/wms/katastar?${wmsParams}`;
        console.log('WMS Proxy - Forwarding to:', wmsUrl);

        const response = await fetch(wmsUrl, {
            headers: {
                'Accept': 'application/json, */*',
                'User-Agent': 'Mozilla/5.0 (compatible; UrbanGameTheory/1.0)',
                'Referer': 'https://geoportal.zagreb.hr/',
                'Origin': 'https://geoportal.zagreb.hr'
            }
        });

        console.log('WMS Proxy - Response status:', response.status);

        // Get the content type from the response
        const contentType = response.headers.get('content-type');
        console.log('WMS Proxy - Content-Type:', contentType);

        // Read the response body
        const responseBody = await response.text();
        console.log('WMS Proxy - Response body:', responseBody);

        if (!response.ok) {
            return NextResponse.json(
                { 
                    error: 'Failed to fetch from WMS service',
                    status: response.status,
                    details: responseBody
                },
                { 
                    status: response.status,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                }
            );
        }

        // Try to parse as JSON if the content type is JSON
        let data;
        if (contentType?.includes('application/json')) {
            try {
                data = JSON.parse(responseBody);
            } catch (e) {
                console.error('WMS Proxy - Failed to parse JSON response:', e);
                data = { raw: responseBody };
            }
        } else {
            data = { raw: responseBody };
        }
        
        return NextResponse.json(data, {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        console.error('WMS Proxy - Internal error:', error);
        return NextResponse.json(
            { 
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { 
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            }
        );
    }
}