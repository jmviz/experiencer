# experiencer

Two mixers with basic controls.
Choose a directory that contains some audio files for each mixer to cycle through with file input.
Each mixer has two tracks, starting and fading to the unactive track when the active track nears its end or skip is pressed.
Each track has filter and delay effects (both default to 0 wetness i.e. "off").
These effects can be adjusted dynamically to create better fades than the standard equal-power crossfade
that is currently implemented. Or can be set to other constant values, e.g. for a filter for the voice mixer.
The webaudio api graph is like so (only one track in one mixer is shown):

<img src="images/graph.png">

To run it on a local server, enter experiencer directory, then, with python 3 installed:

```
python -m http.server 8000
```

or python 2:

```
python -m SimpleHTTPServer 8000
```

and go to [localhost:8000](http://localhost:8000).
