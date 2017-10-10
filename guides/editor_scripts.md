# Editor Scripts

Sometimes you want to have an script running only in your editor to help you with some tasks.
You can use the [Plugin system](plugins.md), and create [Tools](tools.md), but if you want to create something fast and simple the best way is to use the same scripting system from the LiteScene engine, the Script component.

You can create a regular component script but use some of the special editor events:

- ```onEditorRender```: to render gizmos
- ```onEditorRenderGUI```: to render 2D stuff
- ```onEditorEvent```: to catch events on the interface

## Catch input events

If you want to catch user mouse events in the Canvas, you can define the onEditorEvent method in your script.

Keep in mind that this event will be received before any other event, so if you blocked the canvas will stay inresponsive.

The event will have a ```evt.layout``` property that tells you in which canvas layout was received (layouts are like viewports in case you have split screen).

If the function returns true it means the event was blocked and nobody else should use it.

## Render 

Maybe you want to render info in the GUI or maybe you want to render something in the 3D Scene.

To render in the GUI define the ```onEditorRenderGUI``` method.

To render in the scene define the ```onEditorRender``` method.

When rendering in the scene remember you can use the [LS.Draw](https://github.com/jagenjo/litescene.js/blob/master/guides/draw.md) class to help you render simple shapes like lines, points, etc.

## Inspector

Probably your script will require some widgets, to add widgets to your component script that display in the inspector you must use the method ```onInspector```.

```js
this.onInspector = function(inspector)
{
	inspector.addInfo(null, "Num. Points: " + this.points.length );
	inspector.addButton("Clear points", "Clear", { callback: this.clearPoints.bind(this) } );
}
```

For more info about the ```LiteGUI.Inspector``` [check the guide in LiteGUI](https://github.com/jagenjo/litegui.js/blob/master/guides/inspector.md).

## Example

```js
//@Line Editor
//defined: component, node, scene, transform, globals


private var points = [];

var active = false;
var selected = -1;

this.onEditorRenderGUI = function()
{
	var ctx = gl;
  active = LS.GUI.Toggle([30,60,260,40], active, "Edit Points: " + (active ? "On": "Off") );
  if( LS.GUI.Button([30,100,260,40], "Clear" ) )
    this.points.length = 0;
}

this.onRender = function()
{
  LS.Draw.setColor([0.5,0.5,0.5,1]);
  LS.Draw.renderLines( this.points, null, true, true );
}

this.onEditorRender = function()
{
	LS.Draw.setPointSize( 10 );
  LS.Draw.setColor([1,1,1,1]);
  LS.Draw.renderRoundPoints( this.points );
  if( selected != -1 && this.points.length > selected )
  {
    LS.Draw.setPointSize( 10 );
    LS.Draw.setColor([0.5,1,1,1]);
    LS.Draw.renderRoundPoints( this.points[selected] );
  } 
}

var temp_pos2d = vec3.create();

this.onEditorEvent = function(e)
{
  if(!active)
    return;
  
  var layout = e.layout;
  var camera = layout.camera;
  var ray = camera.getRay( e.canvasx, e.canvasy );
  var mouse = vec2.fromValues( e.canvasx, e.canvasy );
  
  //find closer point
  var closer = -1;
  var dist = 100000;
  for(var i = 0; i < this.points.length; ++i)
  {
    camera.project( this.points[i], null, temp_pos2d );
    var d = vec2.dist( mouse, temp_pos2d );
    if( d > 20 || d > dist )
      continue;
    closer = i;
    dist = d;
  }

  //find collision point
  ray.testPlane( [0,0,0], [0,1,0] );

  if(e.type == "mousedown")
  {
    if(closer == -1)
    {
      this.points.push( ray.collision_point );
      selected = this.points.length - 1;
    }
    else
    {
      selected = closer;
    }
  }
  else if(e.type == "mousemove" && e.dragging)
  {
    if( selected && selected != -1 )      
      vec3.copy( this.points[ selected ], ray.collision_point );
  }

  return true;
}
```
