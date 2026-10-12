"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "./store";
import { Icon, Modal } from "./ui";

export function NewProjectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { createProject, projects } = useStore();
  const [name, setName] = useState(projects.length ? "" : "Fall headshots");
  const [role, setRole] = useState<"guardian" | "adult-actor" | "">("");
  const [agree, setAgree] = useState({ rights: false, processing: false, simulation: false });
  const ok = name.trim() && role && agree.rights && agree.processing && agree.simulation;

  return (
    <Modal
      title="New headshot plan"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              createProject(name.trim(), { acceptedAt: Date.now(), role: role as "guardian" | "adult-actor" });
              onCreated();
              onClose();
            }}
          >
            I agree — create plan
          </button>
        </>
      }
    >
      <label className="field">
        <span>Plan name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maya — fall headshots" autoFocus />
      </label>

      <div className="notice notice-info">
        <Icon name="shield" />
        <div className="small">
          <b>Before you upload any photos.</b> Try A Look keeps photos and previews in this browser only — there are no
          accounts, no public galleries, and we never use photos for marketing. To make a preview, the photo is sent
          securely to our image provider, processed, and not stored by Try A Look.{" "}
          <Link href="/privacy" target="_blank">
            Read the full privacy &amp; safety details
          </Link>
          .
        </div>
      </div>

      <div className="stack">
        <span className="label">Who is setting this up?</span>
        <label className="check">
          <input type="radio" name="role" checked={role === "guardian"} onChange={() => setRole("guardian")} />
          <span>I&apos;m the actor&apos;s parent or legal guardian</span>
        </label>
        <label className="check">
          <input type="radio" name="role" checked={role === "adult-actor"} onChange={() => setRole("adult-actor")} />
          <span>I&apos;m the actor, and I&apos;m 18 or older</span>
        </label>
      </div>

      <div className="stack">
        <label className="check">
          <input type="checkbox" checked={agree.rights} onChange={(e) => setAgree({ ...agree, rights: e.target.checked })} />
          <span className="small">
            I have the right to use the photos I upload, and I consent to the actor&apos;s photos being used to create wardrobe previews.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={agree.processing} onChange={(e) => setAgree({ ...agree, processing: e.target.checked })} />
          <span className="small">
            I understand photos are sent to a third-party AI image service to make each preview, as described in the privacy details.
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={agree.simulation} onChange={(e) => setAgree({ ...agree, simulation: e.target.checked })} />
          <span className="small">
            I understand previews are AI simulations for planning only and must not be submitted to agents or casting as real headshots.
          </span>
        </label>
      </div>
    </Modal>
  );
}
