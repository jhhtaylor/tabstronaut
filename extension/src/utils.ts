export function toRelativeTime(date: Date): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "Invalid date";
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

    if (decades > 1) return `${decades} decades ago`;
    if (years > 1) return `${years} years ago`;
    if (months > 1) return `${months} months ago`;
    if (weeks > 1) return `${weeks} weeks ago`;
    if (days > 6) return `last week`;
    if (days > 0) return `${days} days ago`;
    if (hours > 0) return `${hours} hours ago`;
    if (minutes > 0) return `${minutes} minutes ago`;

    return "just now";
}
