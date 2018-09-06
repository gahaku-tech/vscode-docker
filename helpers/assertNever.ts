/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//asdf
export function assertNever(value: never, context?: string): never {
    let contextMessage = context ? ` in context "${context}"` : '';
    throw new Error(`Internal error: Unexpected value found${contextMessage}: ${String(value)}`);
}
