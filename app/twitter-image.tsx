import { OG_SIZE, ogImage } from '../src/seo/ogImage';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'CADNEX: free demo sports betting on real matches';

export default function Image() {
  return ogImage('Demo sports betting on real matches');
}
