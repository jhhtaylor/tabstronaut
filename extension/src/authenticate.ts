import * as vscode from 'vscode';
import { apiBaseUrl } from './constants';
import polka from "polka";

export const authenticate = () => {
    vscode.commands.executeCommand(
        'vscode.open',
        vscode.Uri.parse(`${apiBaseUrl}/auth/github`)
    );
};