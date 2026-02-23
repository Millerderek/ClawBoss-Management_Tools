import { create } from "xmlbuilder2";

export interface TwimlOptions {
  streamUrl: string;
  streamToken: string;
  streamName: string;
  greeting?: string;
}

export const buildTwiml = (opts: TwimlOptions): string => {
  const root = create({ version: "1.0" })
    .ele("Response")
    .ele("Start")
    .ele("Stream")
    .att("url", opts.streamUrl)
    .att("name", opts.streamName);

  if (opts.streamToken) {
    root
      .ele("Parameter")
      .att("name", "token")
      .att("value", opts.streamToken)
      .up();
  }

  root.up().up();

  const response = root.up();
  if (opts.greeting) {
    response.ele("Say", { voice: "Polly.Joanna" }).txt(opts.greeting);
  }

  return response.doc().end({ prettyPrint: true });
};
