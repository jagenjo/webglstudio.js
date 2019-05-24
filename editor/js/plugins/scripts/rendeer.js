// This Plugin shows the possibility of  using another Render Engine with WebGLStudio.
// The idea here is to create a component that calls the other render engine

(function(){

var RendeerEngine = {
	name: "rendeer",

	init: function()
	{
		LiteGUI.requireScript(["http://tamats.com/projects/rendeer/build/rendeer.js"], inner );

		function inner(v)
		{
			console.log("Rendeer engine loaded");
		}
	},

	deinit: function()
	{
	}
};

//component
function Rendeer( o )
{
	this.enabled = true;
	this.shaders = "";

	var rd_scene = this._rd_scene = new RD.Scene();
	this._rd_renderer = new RD.Renderer( gl );

	this._rd_camera = new RD.Camera();

	//test
	var box = new RD.SceneNode();
	box.color = [1,0,0,1];
	box.mesh = "cube";
	box.shader = "phong";
	box.position = [0,0,0];
	box.scale([10,10,10]);
	rd_scene.root.addChild(box);

	if(o)
		this.configure(o);
}

Rendeer.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( LS.Renderer, "renderInstances", this.onRender, this );
}

Rendeer.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( LS.Renderer, "renderInstances", this.onRender, this );
}

Rendeer.prototype.onRender = function( e )
{
	if(!this.enabled)
		return;

	var current_camera = LS.Renderer._current_camera;

	this._rd_camera.perspective( current_camera.fov, current_camera._final_aspect, current_camera.near, current_camera.far );
	this._rd_camera.lookAt( current_camera._global_eye , current_camera._global_center, current_camera._global_up );
	
	this._rd_renderer.render( this._rd_scene, this._rd_camera );
}

Rendeer.prototype.setShaders = function(v)
{
	this.shaders = v;
	if( this._rd_renderer )
		this._rd_renderer.setShadersFromFile(v);
}

LS.registerComponent( Rendeer );

CORE.registerModule( RendeerEngine );


Rendeer.prototype.inspect = function( inspector )
{
	var node = this._root;
	var component = this;
	inspector.addButton(null,"Edit Shaders", function(){
		CodingModule.editInstanceCode( component, { id: component.uid, title: node.id, lang: "text", path: component.uid, help: LS.Components.Rendeer.help, 
			setCode: function(v) { component.setShaders( v ); }, 
			getCode: function() { return this.shaders; }});
	});
	inspector.addButton(null,"Select Node");
}


})();