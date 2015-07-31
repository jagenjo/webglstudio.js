function ResourceVisualizer(options)
{
	options = options || { container: "body" };

	this.createCanvas3D(options);
}

ResourceVisualizer.prototype = {
	enabled: true,

	createCanvas3D: function(options)
	{
		//create canvas and keep the old one
		var gl = GL.create();
		var old_gl = window.gl;
		window.gl = gl;
		this.gl = gl;

		gl.clearColor(0.9,0.5,0.9,1.0);

		var mesh = GL.Mesh.cube();
		var shader = new GL.Shader('\
		  varying vec2 coord;\
		  void main() {\
			coord = gl_TexCoord.xy;\
			gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;\
		  }\
		', '\
		varying vec2 coord;\
		uniform vec3 u_color;\
		void main() {\
			vec3 color = u_color;\
			gl_FragColor = vec4( color,1.0);\
		}\
		');
		//var texture = new GL.Texture(256,256, {wrap: gl.REPEAT, filter: gl.NEAREST });
		var angle = 0;

		gl.disable( gl.CULL_FACE );
		gl.disable( gl.DEPTH_TEST );

		gl.onupdate = function(seconds) {
			angle += seconds * 10;
		};

		var that = this;
		gl.ondraw = function() {
		  //if(!that.enabled) return;
			gl.clearColor(0.3, Math.abs( Math.sin( new Date().getTime() * 0.001 ) ),0.5,1.0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			//var proj = new GL.Matrix.perspective(45,gl.canvas.width / gl.canvas.height,0.1,1000);

			gl.matrixMode(gl.MODELVIEW);
			gl.loadIdentity();
			gl.lookAt(0,0,5,0,0,0,0,1,0);

			gl.rotate(30,1,0,0);
			gl.rotate(angle,0,1,0);

			shader.uniforms({u_color: [0.0,1.0,1.0]});
			shader.draw(mesh);

		};

		//set size
		$(options.container).append( gl.canvas );
		gl.canvas.width = 256;
		gl.canvas.height = 256;

		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		gl.matrixMode(gl.PROJECTION);
		gl.loadIdentity();
		gl.perspective(options.fov || 45, gl.canvas.width / gl.canvas.height, options.near || 0.1, options.far || 1000);
		//gl.ortho(-10,10,-10,10,-10,10);


		var post = function(callback) { setTimeout(callback, 1000 / 60); };
		var time = new Date().getTime();
		function update() {
			var now = new Date().getTime();

			var temp = window.gl;
			window.gl = that.gl;
			var gl = that.gl;
			if (gl.onupdate) gl.onupdate((now - time) / 1000);
			if (gl.ondraw) gl.ondraw();
			post(update);
			time = now;
			window.gl = temp;
		}
		update();

		if(old_gl) window.gl = old_gl;
	}
};