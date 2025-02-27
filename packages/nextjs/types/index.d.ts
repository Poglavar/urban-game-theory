import { FC } from 'react';

declare module '~~/components/MetaHeader' {
    export const MetaHeader: FC;
}

declare module '~~/hooks/scaffold-eth' {
    export function useScaffoldContractRead(options: any): any;
} 