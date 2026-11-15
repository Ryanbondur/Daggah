/** Types for the hosted self-contained bundle (see scripts/bundle-api.mjs). */
export declare const runtime: 'nodejs';
export declare function GET(request: Request): Promise<Response>;
export declare function PUT(request: Request): Promise<Response>;
export declare function OPTIONS(): Promise<Response>;
