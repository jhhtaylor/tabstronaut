import * as vscode from 'vscode';
import { apiBaseUrl } from './constants';
import * as polka from "polka";
import { TokenManager } from './TokenManager';
import axios from 'axios';

export const authenticate = (): Promise<{ name: string } | null> => {
    return new Promise((resolve, reject) => {
        const app = polka();

        app.get(`/auth/:token`, async (req, res) => {
            const { token } = req.params;
            if (!token) {
                res.end(`<h1>Something went wrong</h1>`);
                return;
            }

            await TokenManager.setToken(token);

            res.end(`<h1>Auth was successful, you can close this now</h1>`);

            app.server?.close();
        });

        app.listen(54321, (err: Error) => {
            if (err) {
                vscode.window.showErrorMessage(err.message);
                reject(err);
            } else {
                vscode.commands.executeCommand(
                    'vscode.open',
                    vscode.Uri.parse(`${apiBaseUrl}/auth/github`)
                );
            }
        });

        app.server?.on('close', () => {
            getCurrentUser().then(user => {
                resolve(user);
            }).catch(err => {
                reject(err);
            });
        });
    });
};

async function getCurrentUser(): Promise<{ name: string } | null> {
    try {
        const token = await TokenManager.getToken(); // Get the stored token

        if (!token) {
            return null; // No token available, return null
        }

        const response = await axios.get(`${apiBaseUrl}/me`, {
            headers: { authorization: `Bearer ${token}` } // Send the token in the Authorization header
        });

        if (!response.data.user) {
            return null; // User not found, return null
        }

        return response.data.user;
    } catch (err) {
        console.error(err);
        return null;
    }
}

export async function getLoggedInUser(): Promise<{ name: string } | undefined> {
    try {
        const token = await TokenManager.getToken(); // Get the stored token

        if (!token) {
            return undefined; // No token available, return undefined
        }

        const response = await axios.get(`${apiBaseUrl}/me`, {
            headers: { authorization: `Bearer ${token}` } // Send the token in the Authorization header
        });

        if (!response.data.user) {
            return undefined; // User not found, return undefined
        }

        return response.data.user;
    } catch (err) {
        console.error(err);
        return undefined;
    }
}

