import { SCENES as TEMPLATES, type SceneTemplate } from "../../domain/scene.ts";
import { beach } from "./beach/info.ts";
import { castle } from "./castle/info.ts";

// The scenes the site offers (ADR 0004). An entry is presentation only:
// title, words, cover and suggested colours. The kit, plot and reference
// stay in the domain template it names, and the scene's 3D surroundings load
// separately, so the homepage can list scenes without any of three.js.
// A second scene is a second entry here, not a redesign.

export interface SceneInfo {
  /** The domain template's id: what saved builds are keyed by. */
  id: string;
  title: string;
  /** A short line under the title: where and when. */
  setting: string;
  blurb: string;
  /** Under `public/`; a picture of the scene rendered by this project. */
  cover: string;
  coverAlt: string;
  /** Colour ids to offer first; every colour stays available. */
  suggestedColours: readonly string[];
  /** The colour a new editor session starts with, if not the editor's default. */
  startColour?: string;
  /** The target picture's button, e.g. "Target house", and its alt text. */
  targetLabel: string;
  targetAlt: string;
  /** The plot's surface, if not the default light grey baseplate. */
  plot?: { colour: string; vary: number };
  /** What the editor's opening view frames round the plot's centre, in studs. */
  frame?: { across: number; above: number; below: number };
}

export const SCENE_LIST: readonly SceneInfo[] = [beach, castle];

export const sceneInfo = (id: string): SceneInfo | undefined => SCENE_LIST.find((s) => s.id === id);

export const templateOf = (info: SceneInfo): SceneTemplate => TEMPLATES[info.id];
