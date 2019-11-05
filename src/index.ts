/*---------------------------------------------------------------------------------------------
 *  BrightScript 2D API Emulator (https://github.com/lvcabral/brs-emu)
 *
 *  Copyright (c) 2019 Marcelo Lv Cabral. All Rights Reserved.
 *
 *  Licensed under the MIT License. See LICENSE in the repository root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Interpreter, defaultExecutionOptions } from "./interpreter";
import { RoAssociativeArray, AAMember, BrsString } from "./brsTypes";
import { FileSystem } from "./interpreter/FileSystem";
import { Lexer } from "./lexer";
import { Parser } from "./parser";
import * as PP from "./preprocessor";
import * as BrsError from "./Error";
import * as bslCore from "raw-loader!./common/v30/bslCore.brs";
import * as bslDefender from "raw-loader!./common/v30/bslDefender.brs";
import * as Roku_Ads from "raw-loader!./common/Roku_Ads.brs";
import * as models from "raw-loader!./common/models.csv";
import * as _lexer from "./lexer";
import * as BrsTypes from "./brsTypes";
import * as _parser from "./parser";
import * as path from "path";

export { _lexer as lexer };
export { BrsTypes as types };
export { PP as preprocessor };
export { _parser as parser };
export const shared = new Map<string, Int32Array>();

onmessage = function(event) {
    if (event.data.device) {
        const interpreter = new Interpreter();
        interpreter.onError(logError);
        // Registry
        let registry = event.data.device.registry;
        registry.forEach(function(value: string, key: string) {
            interpreter.registry.set(key, value);
        });
        // DeviceInfo
        interpreter.deviceInfo.set("developerId", event.data.device.developerId);
        interpreter.deviceInfo.set("friendlyName", event.data.device.friendlyName);
        interpreter.deviceInfo.set("deviceModel", event.data.device.deviceModel);
        interpreter.deviceInfo.set("firmwareVersion", event.data.device.firmwareVersion);
        interpreter.deviceInfo.set("clientId", event.data.device.clientId);
        interpreter.deviceInfo.set("RIDA", event.data.device.RIDA);
        interpreter.deviceInfo.set("countryCode", event.data.device.countryCode);
        interpreter.deviceInfo.set("timeZone", event.data.device.timeZone);
        interpreter.deviceInfo.set("locale", event.data.device.locale);
        interpreter.deviceInfo.set("clockFormat", event.data.device.clockFormat);
        interpreter.deviceInfo.set("displayMode", event.data.device.displayMode);
        interpreter.deviceInfo.set("models", parseCSV(models.default));
        interpreter.deviceInfo.set("defaultFont", event.data.device.defaultFont);
        interpreter.deviceInfo.set("maxSimulStreams", event.data.device.maxSimulStreams);
        interpreter.deviceInfo.set("localIps", event.data.device.localIps);
        // File System
        let fontFamily = event.data.device.defaultFont;
        let volume = interpreter.fileSystem.get("common:");
        if (volume) {
            volume.mkdirSync("/LibCore");
            volume.mkdirSync("/LibCore/v30");
            volume.writeFileSync("/LibCore/v30/bslCore.brs", bslCore.default);
            volume.writeFileSync("/LibCore/v30/bslDefender.brs", bslDefender.default);
            volume.mkdirSync("/Fonts");
            let fontRegular = download(`../fonts/${fontFamily}-Regular.ttf`, "arraybuffer");
            if (fontRegular) {
                volume.writeFileSync(`/Fonts/${fontFamily}-Regular.ttf`, fontRegular);
            }
            let fontBold = download(`../fonts/${fontFamily}-Bold.ttf`, "arraybuffer");
            if (fontBold) {
                volume.writeFileSync(`/Fonts/${fontFamily}-Bold.ttf`, fontBold);
            }
            let fontItalic = download(`../fonts/${fontFamily}-Italic.ttf`, "arraybuffer");
            if (fontBold) {
                volume.writeFileSync(`/Fonts/${fontFamily}-Italic.ttf`, fontItalic);
            }
            let fontBoldIt = download(`../fonts/${fontFamily}-BoldItalic.ttf`, "arraybuffer");
            if (fontBold) {
                volume.writeFileSync(`/Fonts/${fontFamily}-BoldItalic.ttf`, fontBoldIt);
            }
        }
        const source = new Map<string, string>();
        volume = interpreter.fileSystem.get("pkg:");
        if (volume) {
            for (let index = 0; index < event.data.paths.length; index++) {
                let filePath = event.data.paths[index];
                if (!volume.existsSync(path.dirname("/" + filePath.url))) {
                    try {
                        mkdirTreeSync(volume, path.dirname("/" + filePath.url));
                    } catch (err) {
                        console.error(
                            "Error creating directory " +
                                path.dirname("/" + filePath.url) +
                                " - " +
                                err.message
                        );
                    }
                }
                try {
                    if (filePath.type === "image") {
                        volume.writeFileSync("/" + filePath.url, event.data.images[filePath.id]);
                    } else if (filePath.type === "font") {
                        volume.writeFileSync("/" + filePath.url, event.data.fonts[filePath.id]);
                    } else if (filePath.type === "audio") {
                        // Save mock file to allow file exist checking, and content contains index
                        volume.writeFileSync("/" + filePath.url, filePath.id.toString());
                    } else if (filePath.type === "text") {
                        volume.writeFileSync("/" + filePath.url, event.data.texts[filePath.id]);
                    } else if (filePath.type === "source") {
                        source.set(filePath.url, event.data.brs[filePath.id]);
                        volume.writeFileSync("/" + filePath.url, event.data.brs[filePath.id]);
                    }
                } catch (err) {
                    console.error("Error writing file " + filePath.url + " - " + err.message);
                }
            }
        }
        // Run Channel
        run(source, interpreter);
        postMessage("end");
    } else {
        // Setup Control Shared Array
        shared.set("buffer", new Int32Array(event.data));
    }
};

/**
 * A synchronous version of the lexer-parser flow.
 *
 * @param filename the paths to BrightScript files to lex and parse synchronously
 * @param options configuration for the execution, including the streams to use for `stdout` and
 *                `stderr` and the base directory for path resolution
 *
 * @returns the AST produced from lexing and parsing the provided files
 */
export function lexParseSync(interpreter: Interpreter, filenames: string[]) {
    const executionOptions = Object.assign(defaultExecutionOptions, interpreter.options);

    let manifest = PP.getManifestSync(executionOptions.root);
    let volume = interpreter.fileSystem.get("pkg:") as FileSystem;

    return filenames
        .map(filename => {
            let contents = volume.readFileSync(filename, "utf8");
            let scanResults = Lexer.scan(contents, filename);
            let preprocessor = new PP.Preprocessor();
            let preprocessorResults = preprocessor.preprocess(scanResults.tokens, manifest);
            return Parser.parse(preprocessorResults.processedTokens).statements;
        })
        .reduce((allStatements, statements) => [...allStatements, ...statements], []);
}

/**
 * Runs an arbitrary string of BrightScript code.
 * @param source array of BrightScript code to lex, parse, and interpret.
 * @param interpreter an interpreter to use when executing `contents`. Required
 *                    for `repl` to have persistent state between user inputs.
 * @returns an array of statement execution results, indicating why each
 *          statement exited and what its return value was, or `undefined` if
 *          `interpreter` threw an Error.
 */
function run(source: Map<string, string>, interpreter: Interpreter) {
    const lexer = new Lexer();
    const parser = new Parser();
    const allStatements = new Array<_parser.Stmt.Statement>();
    const lib = new Map<string, boolean>();
    lib.set("v30/bslDefender.brs", false);
    lib.set("v30/bslCore.brs", false);
    lib.set("Roku_Ads.brs", false);
    lexer.onError(logError);
    parser.onError(logError);
    source.forEach(function(code, path) {
        const scanResults = lexer.scan(code, path);
        if (scanResults.errors.length > 0) {
            return;
        }
        const parseResults = parser.parse(scanResults.tokens);
        if (parseResults.errors.length > 0) {
            return;
        }
        if (parseResults.statements.length === 0) {
            return;
        }
        if (parseResults.libraries.get("v30/bslDefender.brs") === true) {
            lib.set("v30/bslDefender.brs", true);
            lib.set("v30/bslCore.brs", true);
        }
        if (parseResults.libraries.get("v30/bslCore.brs") === true) {
            lib.set("v30/bslCore.brs", true);
        }
        if (parseResults.libraries.get("Roku_Ads.brs") === true) {
            lib.set("Roku_Ads.brs", true);
        }
        allStatements.push(...parseResults.statements);
    });
    if (lib.get("v30/bslDefender.brs") === true) {
        const libScan = lexer.scan(bslDefender.default, "v30/bslDefender.brs");
        const libParse = parser.parse(libScan.tokens);
        allStatements.push(...libParse.statements);
    }
    if (lib.get("v30/bslCore.brs") === true) {
        const libScan = lexer.scan(bslCore.default, "v30/bslCore.brs");
        const libParse = parser.parse(libScan.tokens);
        allStatements.push(...libParse.statements);
    }
    if (lib.get("Roku_Ads.brs") === true) {
        const libScan = lexer.scan(Roku_Ads.default, "Roku_Ads.brs");
        const libParse = parser.parse(libScan.tokens);
        allStatements.push(...libParse.statements);
    }
    try {
        let aa = new Array<AAMember>();
        aa.push({
            name: new BrsString("lastExitOrTerminationReason"),
            value: new BrsString("EXIT_UNKNOWN"),
        });
        aa.push({ name: new BrsString("source"), value: new BrsString("auto-run-dev") });
        return interpreter.exec(allStatements, new RoAssociativeArray(aa));
    } catch (e) {
        console.error(e.message);
        return;
    }
}

/**
 * Logs a detected BRS error to console.
 * @param err the error to log to `console`
 */
function logError(err: BrsError.BrsError) {
    console.error(err.format());
}

/** Parse CSV string into a Map with first column as the key and the value contains the other columns into an array
 * @param csv the string containing the comma-separated values
 */
function parseCSV(csv: string): Map<string, string[]> {
    let result = new Map<string, string[]>();
    let lines = csv.match(/[^\r\n]+/g);
    if (lines) {
        lines.forEach(line => {
            let fields = line.split(",");
            result.set(fields[0], [fields[1], fields[2], fields[3], fields[4]]);
        });
    }
    return result;
}

/**
 * Splits the provided path into folders and recreates directory tree from the root.
 * @param directory the path to be created
 */
function mkdirTreeSync(fs: FileSystem, directory: string) {
    var pathArray = directory.replace(/\/$/, "").split("/");
    for (var i = 1; i <= pathArray.length; i++) {
        var segment = pathArray.slice(0, i).join("/");
        if (fs.normalize(segment) !== "" && !fs.existsSync(segment)) {
            fs.mkdirSync(segment);
        }
    }
}

/**
 * Dowload helper funcion
 * @param url url of the file to be downloaded
 * @param type return type (eg. arraybuffer)
 */
function download(url: string, type: XMLHttpRequestResponseType) {
    try {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false); // Note: synchronous
        xhr.responseType = type;
        xhr.send();
        if (xhr.status !== 200) {
            console.error(xhr.statusText, url);
            return undefined;
        }
        return xhr.response;
    } catch (e) {
        console.error(e.message, url);
    }
}
