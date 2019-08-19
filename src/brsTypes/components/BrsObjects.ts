import { RoAssociativeArray } from "./RoAssociativeArray";
import { RoArray } from "./RoArray";
import { RoList } from "./RoList";
import { Timespan } from "./Timespan";
import { RoSGNode, createNodeByType } from "./RoSGNode";
import { RoRegex } from "./RoRegex";
import { BrsString } from "../BrsType";
import { RoString } from "./RoString";
import { RoXMLElement } from "./RoXMLElement";
import { RoXMLList } from "./RoXMLList";

/** Map containing a list of brightscript components that can be created. */
export const BrsObjects = new Map<string, Function>([
    ["roassociativearray", () => new RoAssociativeArray([])],
    ["roarray", () => new RoArray([])],
    ["rolist", () => new RoList()],
    ["rotimespan", () => new Timespan()],
    ["rosgnode", (nodeType: BrsString) => createNodeByType(nodeType)],
    ["roregex", (expression: BrsString, flags: BrsString) => new RoRegex(expression, flags)],
    ["rostring", (literal: BrsString) => new RoString(literal)],
    ["roxmlelement", () => new RoXMLElement()],
    ["roxmllist", () => new RoXMLList()],
]);
