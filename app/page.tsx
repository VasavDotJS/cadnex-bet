/**
 * The home URL. Visitors and search engines get the public landing page, rendered on the
 * server. Players with a saved login, the installed app and links into the app (/#/live,
 * /#/event/…) get the app straight away; the app handles its own screens with hash routes.
 */
import type { Metadata } from 'next';
import { AppMount } from '../src/seo/AppMount';
import { SeoHome } from '../src/seo/SeoHome';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function Page() {
  return (
    <AppMount>
      <SeoHome />
    </AppMount>
  );
}
