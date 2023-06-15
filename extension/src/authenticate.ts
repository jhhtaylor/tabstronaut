import * as vscode from 'vscode';
import * as polka from "polka";
import axios from 'axios';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { TokenManager } from './TokenManager';
import { apiBaseUrl } from './constants';

async function getGithubSVG(): Promise<string> {
    const extension = vscode.extensions.getExtension('Jon Taylor.tabstronaut');
    if (!extension) {
        console.error('Could not find extension');
        throw new Error('Could not find extension');
    }
    const extensionDirectoryPath = extension.extensionPath;
    const pathToSVG = path.join(extensionDirectoryPath, 'media', 'github-mark.svg');
    const svgBuffer = await fsPromises.readFile(pathToSVG);
    return svgBuffer.toString('base64');
}

async function getAuthPageHTML(): Promise<string> {
    const extension = vscode.extensions.getExtension('Jon Taylor.tabstronaut');
    if (!extension) {
        console.error('Could not find extension');
        throw new Error('Could not find extension');
    }
    const extensionDirectoryPath = extension.extensionPath;
    const pathToHTML = path.join(extensionDirectoryPath, 'views', 'authPage.html');
    let htmlBuffer = await fsPromises.readFile(pathToHTML, 'utf-8');
    return htmlBuffer.replace('PLACEHOLDER', `data:image/svg+xml;base64,${await getGithubSVG()}`);
}

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

            const authPageHTML = await getAuthPageHTML();

            res.end(authPageHTML);

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
        const token = await TokenManager.getToken();

        if (!token) {
            return null;
        }


        const response = await axios.get(`${apiBaseUrl}/me`, {
            headers: { authorization: `Bearer ${token}` }
        });

        if (!response.data.user) {
            return null;
        }

        return response.data.user;
    } catch (err) {
        console.error(err);
        return null;
    }
}

export async function getLoggedInUser(): Promise<{ name: string } | undefined> {
    try {
        const token = await TokenManager.getToken();

        if (!token) {
            return undefined;
        }

        const response = await axios.get(`${apiBaseUrl}/me`, {
            headers: { authorization: `Bearer ${token}` }
        });

        if (!response.data.user) {
            return undefined;
        }

        return response.data.user;
    } catch (err) {
        console.error(err);
        return undefined;
    }
}
