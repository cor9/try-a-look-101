import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy & safety — Try A Look" };

export default function PrivacyPage() {
  return (
    <main className="main">
      <div className="prose stack">
        <Link href="/" className="small">
          ← Back to Try A Look
        </Link>
        <h1>Privacy &amp; safety</h1>
        <p>
          Try A Look is built for families of young actors, so it&apos;s designed to handle photos of children with care. Here&apos;s exactly what happens to your photos.
        </p>

        <h2>Consent</h2>
        <ul>
          <li>Every project starts with a consent step. Only a parent or legal guardian — or an actor who is 18 or older — may upload photos.</li>
          <li>We record that consent (date and whether you&apos;re a guardian or adult actor) with the project, in your browser.</li>
        </ul>

        <h2>Where your photos live</h2>
        <ul>
          <li>
            <b>Private by default.</b> Projects, actor photos, wardrobe photos and generated previews are stored only in your web browser on this device (browser storage called IndexedDB). There are no accounts and no public galleries.
          </li>
          <li>Try A Look&apos;s server does not save your photos or previews. It passes them to the AI image provider to make a preview and sends the result straight back to you.</li>
          <li>Photos are resized and re-encoded in your browser before upload, which also strips location data (EXIF/GPS) from the files.</li>
          <li>We never use uploaded photos or previews for marketing, training or promotion. Any such use would require separate, written permission.</li>
        </ul>

        <h2>Retention</h2>
        <ul>
          <li><b>On your device:</b> kept until you delete them. Use &ldquo;Delete this project&rdquo; or &ldquo;Delete everything&rdquo; on the Actor step to erase them immediately. Clearing your browser&apos;s site data also erases them.</li>
          <li><b>On Try A Look&apos;s server:</b> none. Requests are processed in memory. We keep only anonymous usage counters (a one-way hash of your IP address, counts and estimated cost) for rate limiting, which expire within 48 hours.</li>
          <li>
            <b>At the AI provider:</b> each preview request is processed by Google (Gemini API, paid tier) or OpenAI (API), depending on configuration. Under their API terms, paid API data isn&apos;t used to train their models, but providers may keep requests for a limited period (typically up to about 30 days) to detect abuse. Check the provider&apos;s current data-use terms for details.
          </li>
        </ul>

        <h2>Safety</h2>
        <ul>
          <li>Every preview is labeled as an <b>AI wardrobe simulation</b> — on screen, in downloads and in the PDF plan. Previews are for planning only and must never be sent to agents or casting as real headshots.</li>
          <li>Generation instructions tell the model to keep the actor&apos;s real face, hair, skin tone, body and age — no beautifying, slimming, aging or makeup.</li>
          <li>Wardrobe is limited to modest, age-appropriate headshot clothing. Requests for swimwear, underwear or suggestive styling are blocked before they reach the AI, and the provider applies its own safety filters.</li>
          <li>Usage limits per visitor and a daily budget cap protect the service from abuse.</li>
        </ul>

        <h2>Questions or removal requests</h2>
        <p>
          Contact Child Actor 101 through <a href="https://childactor101.com">childactor101.com</a>. Since we don&apos;t store your photos, the fastest way to remove them is the delete buttons in the app.
        </p>
      </div>
    </main>
  );
}
