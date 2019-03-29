///@INFO: UNCOMMON
// This Component shows the possibility of using another Render Engine within WebGLStudio.
// The idea here is to create a component that calls the other render engine renderer during my rendering method
function ThreeJS( o )
{
	this.enabled = true;
	this.autoclear = true; //clears the scene on start

	this._code = ThreeJS.default_code;

	if(global.gl)
	{
		if( typeof(THREE) == "undefined")
			this.loadLibrary( function() { this.setupContext(); } );
		else
			this.setupContext();
	}

	this._script = new LScript();
	//maybe add function to retrieve texture
	this._script.catch_exceptions = false;

	if(o)
		this.configure(o);
}

ThreeJS.prototype.setupContext = function()
{
	if(this._engine)
		return;

	if( typeof(THREE) == "undefined")
	{
		console.error("ThreeJS library not loaded");
		return;
	}

	if( !THREE.Scene )
	{
		console.error("ThreeJS error parsing library");
		return; //this could happen if there was an error parsing THREE.JS
	}

	//GLOBAL VARS
	this._engine = {
		component: this,
		node: this._root,
		scene: new THREE.Scene(),
		camera: new THREE.PerspectiveCamera( 70, gl.canvas.width / gl.canvas.height, 1, 1000 ),
		renderer: new THREE.WebGLRenderer( { canvas: gl.canvas, context: gl } ),
		root: new THREE.Object3D(),
		ThreeJS: this.constructor
	};
	this._engine.scene.add( this._engine.root );
}

ThreeJS.default_code = "//renderer, camera, scene, already created, they are globals.\n//use root as your base Object3D node if you want to use the scene manipulators.\n\nthis.start = function() {\n}\n\nthis.render = function(){\n}\n\nthis.update = function(dt){\n}\n";
ThreeJS.library_url = "http://threejs.org/build/three.js";


Object.defineProperty( ThreeJS.prototype, "code", {
	set: function(v)
	{
		this._code = v;
		this.processCode();
	},
	get: function() { return this._code; },
	enumerable: true
});

ThreeJS["@code"] = { widget: "code", allow_inline: false };

ThreeJS.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( LS.Renderer, "renderInstances", this.onEvent, this );
	LEvent.bind( scene, "start", this.onEvent, this );
	LEvent.bind( scene, "update", this.onEvent, this );
	LEvent.bind( scene, "finish", this.onEvent, this );
	this.processCode();
}

ThreeJS.prototype.clearScene = function()
{
	if(!this._engine)
		return;

	//remove inside root
	var root = this._engine.root;
	for( var i = root.children.length - 1; i >= 0; i--) 
		root.remove( root.children[i] );

	//remove inside scene but not root
	root = this._engine.scene;
	for( var i = root.children.length - 1; i >= 0; i--) 
		if( root.children[i] != this._engine.root )
			root.remove( root.children[i] );
}

ThreeJS.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( LS.Renderer, "renderInstances", this.onEvent, this );
	LEvent.unbindAll( scene, this );

	//clear scene
	if(this.autoclear)
		this.clearScene();
}

ThreeJS.prototype.onEvent = function( e, param )
{
	if( !this.enabled || !this._engine )
		return;

	var engine = this._engine;

	if(e == "start")
	{
		//clear scene?
		if(this.autoclear)
			this.clearScene();

		if(this._script)
			this._script.callMethod( "start" );
	}
	else if(e == "renderInstances")
	{
		//copy camera info so both cameras matches
		var current_camera = LS.Renderer._current_camera;
		engine.camera.fov = current_camera.fov;
		engine.camera.aspect = current_camera._final_aspect;
		engine.camera.near = current_camera.near;
		engine.camera.far = current_camera.far;
		engine.camera.updateProjectionMatrix()
		engine.camera.position.fromArray( current_camera._global_eye );
		engine.camera.lookAt( new THREE.Vector3( current_camera._global_center[0], current_camera._global_center[1], current_camera._global_center[2] ) );

		//copy the root info
		ThreeJS.copyTransform( this._root, engine.root );
		
		//render using ThreeJS
		engine.renderer.setSize( gl.viewport_data[2], gl.viewport_data[3] );
		if( engine.renderer.resetGLState )
			engine.renderer.resetGLState();
		else if( engine.renderer.state.reset )
			engine.renderer.state.reset();

		if(this._script)
			this._script.callMethod( "render" );
		else
			engine.renderer.render( engine.scene, engine.camera ); //render the scene

		//reset GL here?
		//read the root position and update the node?
	}
	else if(e == "update")
	{
		if(this._script)
			this._script.callMethod( "update", param );
		else
			engine.scene.update( param );
	}
	else if(e == "finish")
	{
		if(this._script)
			this._script.callMethod( "finish" );
	}
}

/*
ThreeJS.prototype.getCode = function()
{
	return this.code;
}

ThreeJS.prototype.setCode = function( code, skip_events )
{
	this.code = code;
	this.processCode( skip_events );
}
*/

ThreeJS.copyTransform = function( a, b )
{
	//litescene to threejs
	if( a.constructor === LS.SceneNode )
	{
		var global_position = vec3.create();
		if(a.transform)
			a.transform.getGlobalPosition( global_position );
		b.position.set( global_position[0], global_position[1], global_position[2] );

		//rotation
		var global_rotation = quat.create();
		if(a.transform)
			a.transform.getGlobalRotation( global_rotation );
		b.quaternion.set( global_rotation[0], global_rotation[1], global_rotation[2], global_rotation[3] );

		//scale
		var global_scale = vec3.fromValues(1,1,1);
		if(a.transform)
			a.transform.getGlobalScale( global_scale );
		b.scale.set( global_scale[0], global_scale[1], global_scale[2] );
	}
	if( a.constructor === LS.Transform )
	{
		var global_position = vec3.create();
		a.getGlobalPosition( global_position );
		b.position.set( global_position[0], global_position[1], global_position[2] );

		//rotation
		var global_rotation = quat.create();
		a.getGlobalRotation( global_rotation );
		b.quaternion.set( global_rotation[0], global_rotation[1], global_rotation[2], global_rotation[3] );

		//scale
		var global_scale = vec3.fromValues(1,1,1);
		a.getGlobalScale( global_scale );
		b.scale.set( global_scale[0], global_scale[1], global_scale[2] );
	}
	else //threejs to litescene
	{
		if( b.constructor == LS.Transform )
			b.fromMatrix( a.matrixWorld );
		else if( b.constructor == LS.SceneNode && b.transform )
			b.transform.fromMatrix( a.matrixWorld );
	}
}

ThreeJS.prototype.loadLibrary = function( on_complete )
{
	if( typeof(THREE) !== "undefined" )
	{
		if(on_complete)
			on_complete.call(this);
		return;
	}

	if( this._loading )
	{
		LEvent.bind( this, "threejs_loaded", on_complete, this );
		return;
	}

	if(this._loaded)
	{
		if(on_complete)
			on_complete.call(this);
		return;
	}

	this._loading = true;
	var that = this;

	LS.Network.requestScript( ThreeJS.library_url, function(){
		console.log("ThreeJS library loaded");
		that._loading = false;
		that._loaded = true;
		LEvent.trigger( that, "threejs_loaded" );
		LEvent.unbindAllEvent( that, "threejs_loaded" );
		if(!that._engine)
			that.setupContext();
	});
}

ThreeJS.prototype.processCode = function( skip_events )
{
	if(!this._script || !this._root || !this._root.scene )
		return;

	this._script.code = this.code;

	//force threejs inclusion
	if( typeof(THREE) == "undefined")
	{
		this.loadLibrary( function() { 
			this.processCode(); 
		});
		return;
	}

	if(!this._engine)
		this.setupContext();

	if(this._root && !LS.Script.block_execution )
	{
		//compiles and executes the context
		return this._script.compile( this._engine, true );
	}
	return true;
}


LS.registerComponent( ThreeJS );
