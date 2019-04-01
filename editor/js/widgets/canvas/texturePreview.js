//This widget allows to preview a the texture content directly in the canvas scene view
function TexturePreviewWidget()
{
	this._ctor();
	this.title = "";
	this.border = true;
	this.draggable = true;
	this.resizable = true;
	this.closable = true;
	this.texture_name = "";
	this.position = [40,40];
	this.size = [250,200];
	this._last_click = 0;

	this.channel = -1;
	this.exposition = 1;
	this.scale = 1;
	this.offset = vec2.create();
	this.xray_mode = false;
	this._texture = null;
	this._uniforms = {
		u_texture: 0,
		u_exposition: 1,
		u_channel: -1,
		u_scale: 1, 
		u_offset: this.offset, 
		u_resolution: vec2.create(),
		u_viewport: vec4.create()
	};

}

TexturePreviewWidget.title = "Texture Preview";

TexturePreviewWidget.prototype.getTexture = function()
{
	var texture = this._texture ? this._texture : LS.ResourcesManager.textures[ this.texture_name ];
	if(!texture)
		texture = GL.Texture.getBlackTexture();
	return texture;
}

TexturePreviewWidget.prototype.onRender = function( ctx, viewport )
{
	var texture = this.getTexture();

	var old = gl.getViewport();

	gl.setViewport( viewport, true );

	var shader = TexturePreviewWidget._shader;
	if(!shader)
		shader = TexturePreviewWidget._shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, TexturePreviewWidget.pixel_shader );

	this._uniforms.u_exposition = this.exposition;
	this._uniforms.u_scale = this.scale;
	this._uniforms.u_channel = this.channel;
	this._uniforms.u_xray_mode = this.xray_mode ? 1 : 0;
	this._uniforms.u_viewport.set( old );
	this._uniforms.u_resolution[0] = texture.width;
	this._uniforms.u_resolution[1] = texture.height;

	texture.toViewport( shader, this._uniforms );
	if(this.title)
	{
		gl.fillStyle = "white";
		gl.fillText( this.title, 10,18 );
	}

	gl.setViewport( old );//restore
}

TexturePreviewWidget.prototype.onEvent = function(e)
{
	if(e.type == "mousemove")
		return;

	var inside = this.isEventInside(e);
	if(e.type == "mouseup")
	{
		console.log(e.type);
	}

	if(e.type == "mousedown" && e.button == 2 && inside)
	{
		this.showContextMenu( e );
		return true;
	}

	if(e.type == "mousedown" && e.button == 0 && inside && (getTime() - this._last_click) < 200 )
	{
		EditorModule.inspect( this );
		return true;
	}
	
	if(e.type == "mouseup" && e.button == 0 && inside)
	{
		this._last_click = getTime();
		//return true;
	}
}

TexturePreviewWidget.prototype.showContextMenu = function( e )
{
	var that = this;

	var options = [
		"inspect",
		"x-ray",
		null,
		"close"
	];

	var menu = new LiteGUI.ContextMenu( options, {  event: e, title: "TexturePreview", callback: function( action, o, e ) {
		if(action == "inspect")
			EditorModule.inspect( that );
		else if(action == "x-ray")
			that.xray_mode = !that.xray_mode;
		else if(action == "close")
			that.close();
	}});
}

TexturePreviewWidget.prototype.inspect = function( inspector )
{
	var that = this;

	inspector.clear();
	inspector.addTexture("Texture", this.texture_name, { callback: function(v){
		that.texture_name = v;
		that._texture = null;
	}});

	var texture = this.getTexture();
	if(this.texture_name.length || this._texture)
	{
		var formats = { 6407: "gl.RGB", 6408: "gl.RGBA", };
		var types = { 5121: "gl.UNSIGNED_BYTE", 36193: "gl.HALF_FLOAT_OES", 5126: "gl.FLOAT" };

		inspector.addString("Width", texture.width );
		inspector.addString("Height", texture.height );
		inspector.addString("Format", formats[ texture.format ]);
		inspector.addString("Type", types[ texture.type ]);
	}

	inspector.addSeparator();

	inspector.addCombo("Channels", this.channel, { values: {"RGB":-1,"RED":0,"GREEN":1,"BLUE":2,"ALPHA":3}, callback: function(v){
		that.channel = v;
	}});
	inspector.addSlider("Exposition", this.exposition, { min:0, max:2, step:0.001, precision: 3, callback: function(v){
		that.exposition = v;
	}});
	inspector.addSlider("Scale", this.scale, { min:0, max:10, step:0.01, precision: 2, callback: function(v){
		that.scale = v;
	}});
	inspector.addVector2("Offset", this.offset, { step:0.01, precision: 2, callback: function(v){
		that.offset.set(v);
	}});
	inspector.addCheckbox("XRay mode", this.xray_mode, { callback: function(v){
		that.xray_mode = v;
	}});
}

TexturePreviewWidget.pixel_shader = "precision highp float;\n\
	varying vec2 v_coord;\n\
	uniform sampler2D u_texture;\n\
	uniform float u_exposition;\n\
	uniform int u_channel;\n\
	uniform int u_xray_mode;\n\
	uniform vec4 u_viewport;\n\
	uniform vec2 u_resolution;\n\
	uniform float u_scale;\n\
	uniform vec2 u_offset;\n\
	\n\
	void main() {\n\
		vec2 uv = v_coord;\n\
		vec2 ratio = u_viewport.zw / u_resolution;\n\
		if(u_xray_mode == 1)\n\
			uv = (gl_FragCoord.st / (u_resolution * ratio));\n\
		uv = (uv - vec2(0.5) - u_offset) / u_scale + vec2(0.5) + u_offset;\n\
		vec4 color = texture2D( u_texture, uv );\n\
		color *= u_exposition;\n\
		if( u_channel == 0 )\n\
			color.xyz = vec3(color.x);\n\
		else if( u_channel == 1 )\n\
			color.xyz = vec3(color.y);\n\
		else if( u_channel == 2 )\n\
			color.xyz = vec3(color.z);\n\
		else if( u_channel == 3 )\n\
			color.xyz = vec3(color.w);\n\
		gl_FragColor = vec4( color.xyz, 1.0 );\n\
}";

LS.extendClass( TexturePreviewWidget, CanvasElement );

EditorModule.registerCanvasWidget( TexturePreviewWidget );

