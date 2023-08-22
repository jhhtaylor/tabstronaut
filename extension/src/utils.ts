import * as vscode from 'vscode';
import * as path from 'path';

export function toRelativeTime(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "";
    }
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    const decades = Math.floor(years / 10);

    if (decades === 1) return `${decades} decade ago`;
    if (decades > 1) return `${decades} decades ago`;
    if (years === 1) return `${years} year ago`;
    if (years > 1) return `${years} years ago`;
    if (months === 1) return `${months} month ago`;
    if (months > 1) return `${months} months ago`;
    if (weeks === 1) return `${weeks} week ago`;
    if (weeks > 1) return `${weeks} weeks ago`;
    if (days === 1) return `${days} day ago`;
    if (days > 6) return `last week`;
    if (days > 1) return `${days} days ago`;
    if (hours === 1) return `${hours} hour ago`;
    if (hours > 1) return `${hours} hours ago`;
    if (minutes === 1) return `${minutes} minute ago`;
    if (minutes > 1) return `${minutes} minutes ago`;

    return "just now";
}

export function getTrimmedDirectoryPath(filePath: string): string {
    const segments = filePath.split('/');
    if (segments.length > 0) {
        segments.shift();
    }
    if (segments.length > 0) {
        segments.pop();
    }
    const modifiedPath = segments.join('/');

    return modifiedPath;
}

export function getRelativeDescription(filePath: string): string {
    let relativePath = vscode.workspace.asRelativePath(filePath, true);

    if (path.isAbsolute(relativePath)) {
        return '.. (External)';
    }

    return getTrimmedDirectoryPath(relativePath);
}

export function normalizePath(p: string): string {
    let normalizedPath = p.replace(/\\/g, '/');
    return normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath;
}

export const COLORS = [
    "terminal.ansiRed",
    "terminal.ansiYellow",
    "terminal.ansiMagenta",
    "terminal.ansiBlue",
    "terminal.ansiCyan",
    "terminal.ansiGreen",
];

export const COLOR_LABELS = [
    "Red",
    "Yellow",
    "Magenta",
    "Blue",
    "Cyan",
    "Green",
];

export function getColorHash(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash |= 0; // Convert to a 32-bit integer
    }
    return hash;
}