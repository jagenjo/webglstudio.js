# Editor Scripts

Sometimes you want to have an script running only in your editor to help you with some tasks.
You can use the Plugin system, and create Tools, but if you want to create something fast and simple the best way is to use the same scripting system from the LiteScene engine, the Script component.

You can create a regular component script but use some of the special editor events:

- ```onEditorRender```: to render gizmos
- ```onEditorRenderGUI```: to render 2D stuff
- ```onEditorEvent```: to catch events on the interface

## Interface

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

this.onInspector = function(inspector)
{
	inspector.addInfo(null, "Num. Points: " + this.points.length );
	inspector.addButton("Clear points", "Clear", { callback: this.clearPoints.bind(this) } );
}

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

this.onEditorEvent = function(e)
{
  //if(e.type != "update")
	//	console.log(e);
  if(active)
  {
    if(e.type == "mousedown")
    {
      //debugger;
      var layout = e.layout;
      var camera = layout.camera;
      var ray = camera.getRay( e.canvasx, e.canvasy );

      if( ray.testPlane( [0,0,0], [0,1,0] ) )
      {
        console.log( ray.collision_point );
        this.points.push( ray.collision_point );
        selected = this.points.length - 1;
      }
    }
   return true;
  }
}
```
