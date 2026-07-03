import type { LiveBracketSide } from "./liveBracketTracker";

export function liveSideRowClassName(side: LiveBracketSide): string {
  if (side.fillState === "no_saved_pick") {
    return "border-dashed border-ash-border/35 bg-ash-body/10 opacity-75";
  }
  if (side.fillState === "awaiting") {
    return "border-dashed border-ash-border/40 bg-ash-body/15 opacity-80";
  }
  if (side.participantPick === "your_pick_eliminated" || side.eliminatedFromTournament) {
    return "border-red-900/40 bg-red-950/20 opacity-80";
  }
  if (side.participantPick === "your_pick" || side.participantPick === "your_pick_alive") {
    return "border-ash-accent/55 bg-ash-accent/18 ring-1 ring-ash-accent/30";
  }
  if (side.participantPick === "not_your_pick") {
    return "border-emerald-800/35 bg-emerald-950/15 opacity-90";
  }
  if (side.tournamentOutcome === "advanced") {
    return "border-emerald-800/45 bg-emerald-950/20";
  }
  if (side.tournamentOutcome === "eliminated") {
    return "border-ash-border/45 bg-ash-body/15 opacity-75";
  }
  if (side.teamId) {
    return "border-ash-border/70 bg-ash-body/35";
  }
  return "border-ash-border/50 bg-ash-body/20";
}

export function liveSideNameClassName(side: LiveBracketSide): string {
  if (side.fillState === "no_saved_pick" || side.fillState === "awaiting") {
    return "text-[10px] font-normal italic text-ash-muted/90";
  }
  if (
    side.participantPick === "your_pick_eliminated" ||
    side.eliminatedFromTournament ||
    side.tournamentOutcome === "eliminated"
  ) {
    return "text-ash-muted";
  }
  if (side.participantPick === "your_pick" || side.participantPick === "your_pick_alive") {
    return "text-ash-text";
  }
  if (side.participantPick === "not_your_pick") {
    return "text-ash-text/90";
  }
  if (side.tournamentOutcome === "advanced") {
    return "text-ash-text";
  }
  return side.teamId ? "text-ash-text" : "text-ash-muted";
}

export function liveSideNeedsMutedFlag(side: LiveBracketSide): boolean {
  return (
    side.eliminatedFromTournament ||
    side.tournamentOutcome === "eliminated" ||
    side.participantPick === "your_pick_eliminated"
  );
}

export function liveSideShowsFlag(side: LiveBracketSide): boolean {
  return side.fillState === "team" && Boolean(side.teamId);
}
