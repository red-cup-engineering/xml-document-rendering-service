import { decodeUtf8Source, defineSourceCodec, encodeUtf8Source } from "@red-cup-engineering/signcell/source-codec";
import { readXmlDocument, UnsupportedXmlFeatureError, XML_DOCUMENT_MAX_BYTES } from "./document-read.mjs";
import { writeXmlDocument } from "./document-write.mjs";

/** Ordered XML 1.0/Namespaces 1.0 nodes carried in UTF-8 with DTD processing excluded. */
export const xmlSourceCodec = defineSourceCodec({
  id: "xml.document/v1",
  mediaType: "application/xml",
  maxBytes: XML_DOCUMENT_MAX_BYTES,
  valueIdentity: "exact",
  decode(bytes) {
    const document = readXmlDocument(decodeUtf8Source(bytes));
    const encoding = document.children.find(node => node.kind === "xmldecl")?.encoding;
    if (encoding !== undefined && !/^utf-8$/iu.test(encoding)) {
      throw new UnsupportedXmlFeatureError("XML byte source must declare UTF-8 when it declares an encoding");
    }
    return document;
  },
  encode: document => encodeUtf8Source(writeXmlDocument(document)),
});
