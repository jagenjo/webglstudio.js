/* Some useful 3d functions */

function testVectorPlane(start, direction, P, N)
{
	var d = (P[0] * N[0] + P[1] * N[1] + P[2] * N[2]);
	var num = N[0]*start[0] + N[1]*start[1] + N[2]*start[2] + d;
	var denom = N[0]*direction[0] + N[1]*direction[1] + N[2]*direction[2];
	if(denom == 0) return null;

	var t = -(num / denom);
	return [ start[0]+t*direction[0], start[1]+t*direction[1], start[2]+t*direction[2] ];
}

function paintQuads( quads, texture, color )
{
	var verticesArray = [];
	var uvsArray = [];

	color = color || [1,1,1,1];

	for(var i = 0; i < quads.length; i++)
	{
		var q = quads[i];

		verticesArray.push( [q.start[0], q.start[1]] );
		uvsArray.push( [0,0] );
		verticesArray.push( [q.end[0], q.start[1]] );
		uvsArray.push( [1,0] );
		verticesArray.push( [q.end[0], q.end[1]] );
		uvsArray.push( [1,1] );

		verticesArray.push( [q.start[0], q.start[1]] );
		uvsArray.push( [0,0] );
		verticesArray.push( [q.end[0], q.end[1]] );
		uvsArray.push( [1,1] );
		verticesArray.push( [q.start[0], q.end[1]] );
		uvsArray.push( [0,1] );
	}

	var mesh = GL.Mesh.load({ vertices: verticesArray, coords: uvsArray });

	var shader = Shaders.get( texture ? "texture_flat" : "flat");

	if(texture)
		texture.bind();
	shader.uniforms({u_material_color: color, texture: 0});

	shader.draw(mesh, gl.TRIANGLES);
}






