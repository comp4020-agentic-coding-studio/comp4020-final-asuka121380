import { SCENES as TEMPLATES, type SceneTemplate } from "../../domain/scene.ts";
import { beach } from "./beach/info.ts";
import { castle } from "./castle/info.ts";
import { treehouse } from "./treehouse/info.ts";

// The scenes the site offers (ADR 0004). An entry is presentation only:
// title, words, cover and suggested colours. The kit, plot and reference
// stay in the domain template it names, and the scene's 3D surroundings load
// separately, so the homepage can list scenes without any of three.js.
// A second scene is a second entry here, not a redesign.

export interface SceneInfo {
  /** The domain template's id: what saved builds are keyed by. */
  id: string;
  title: string;
  /** Where it sits in the progression from Beach Houses to Woodland Commons (ADR 0016). */
  size: "Small" | "Medium" | "Large";
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
  /**
   * The editor's reference panel: optional inspiration, never a goal (ADR
   * 0016). `label` names the toggle and the card ("Tree-house
   * inspiration"); `alt` describes the picture; `note`, if given, says what
   * in the picture is already in the scene and what the kit builds.
   */
  inspiration: {
    label: string;
    alt: string;
    note?: { fixed: string; built: string };
    /** The picture's size in pixels, if not 360 × 300. */
    size?: [number, number];
  };
  /** The plot's surface, if not the default light grey baseplate. */
  plot?: { colour: string; vary: number };
  /** What the editor's opening view frames round the plot's centre, in studs. */
  frame?: { across: number; above: number; below: number };
  /**
   * Scene-specific camera limits for a tall scene (ADR 0016), in world units:
   * the opening view's centre height, how high the orbit centre may be
   * panned or focused, and the farthest zoom. Defaults suit a low plot.
   */
  camera?: {
    centreY: number;
    panHeight: number;
    maxDistance: number;
    /** The opening view's pitch from straight down, in radians (default 1.32). */
    polar?: number;
    /** Where the orbit centre sits on the free screen, from the top (default 0.6). */
    targetAt?: number;
  };
  /** Whether the editor offers "Hide leaves": a local view setting that hides only the canopy (ADR 0016). */
  foliageToggle?: boolean;
}

// Smallest to largest: Beach Houses (2 builders), the castle (4), Woodland
// Commons (6). The homepage tray and the lobby show them in this order.
export const SCENE_LIST: readonly SceneInfo[] = [beach, castle, treehouse];

export const sceneInfo = (id: string): SceneInfo | undefined => SCENE_LIST.find((s) => s.id === id);

export const templateOf = (info: SceneInfo): SceneTemplate => TEMPLATES[info.id];
