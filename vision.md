# Vision: Code Factory Builder

> Verbatim from founder, Aug 19 2026

OK I'm taking a step back here after reviewing your code and I have a few different thoughts and ideas. This is sort of free form.

Firstly I thought about how what I think I want to build is a code-factory builder. Not a single code factory. But rather one which provides an interface for people to bring their own flows. Essentially a code factory is a graph of agent nodes which something triggers. Inside you might have loops, choice steps, etc. And I imagined how someone might conceptualize this in a UI and how that might impact our design initially. For example if I was at a white board, I might write something like the image. And I found myself writing most of my prompts into the edges, not the nodes.

So for this next version, I want to pursue an edge-first schema which could be extended in the future. I imagine we may implement some sort of prompt stacking, like each node contains a "system prompt" and the instructions from the edge get added to it or something.

I imagined a UI where users simply build their graph visually, and that gets compiled into JSON. Semantic analysis might be necessary to ensure choice state prompts match the expected choice state variable names but we can kick that can down the road.

I thought about how some graphs might take hours to complete, so we'd want to enable introspection like "what is the current state of a given ticket and where in the graph is it? Where in the graph has it been? I'm hoping we get that for free in the state machine library we're using.

I thought about how we might start with this being a CLI with a dependency on cursor cloud agents. Not sure if we'd have a local daemon or something which tracks ongoing sessions or what not. Or if there would be a server process which could manage stuff. I do imagine a world where after CLI success, people just want to be able to upload a graph to our server and start interacting with it one way or another.

I was also thinking we might ship a couple basic opinionated workflows, like "bug fix" and "big feature" or something. Ones which people can reasonably use off the shelf. While also letting them copy to new or create from scratch.

I was thinking each node may eventually have a boiler plate component to it that tracks state, logs etc.
